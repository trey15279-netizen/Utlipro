// SECURITY LAB Field Guide: a reference entry for each vulnerability class.
// `hot` is the 1-based line that matters in each code sample.
"use strict";

window.SL_GUIDE = [
  { id: "reentrancy", name: "Reentrancy", category: "External calls", severity: "Critical",
    keywords: "re-entrancy callback receive fallback cei checks effects interactions nonReentrant withdraw",
    definition: "An external call hands control to another contract before the caller finishes updating its own state. The callee calls back in and acts on stale state.",
    root: "State that the external call depends on is updated after the call instead of before it.",
    vuln: { file: "SimpleVault.sol", hot: 3, code: `
function withdraw() external {
  uint256 amount = balances[msg.sender];
  (bool success, ) = msg.sender.call{value: amount}("");
  require(success, "Transfer failed");
  balances[msg.sender] = 0;
}` },
    conditions: [
      "The function makes an external call that hands over control: sending ETH with call, or token hooks such as ERC-777 or ERC-721 receivers.",
      "State the call depends on is updated after the call.",
      "The attacker can deploy a contract that receives the callback.",
      "No reentrancy guard covers the functions that share that state."
    ],
    sequence: [
      "Attacker deposits a small amount through an attack contract.",
      "Attacker calls withdraw().",
      "The vault sends ETH, so the attack contract's receive() runs.",
      "receive() calls withdraw() again while the balance is unchanged.",
      "The loop repeats until the vault is empty; only then is the balance set to 0."
    ],
    impact: "Theft of all ETH held by the contract, including other users' deposits.",
    mitigation: "Update state before the external call (checks-effects-interactions) and add a nonReentrant guard to every function sharing the state.",
    secure: { file: "SimpleVault.sol", hot: 3, code: `
function withdraw() external nonReentrant {
  uint256 amount = balances[msg.sender];
  balances[msg.sender] = 0;
  (bool success, ) = msg.sender.call{value: amount}("");
  require(success, "Transfer failed");
}` },
    testing: [
      "Write an attacker contract whose receive() re-enters withdraw(), and run it in a local test.",
      "Assert the vault still holds every honest user's deposit after the attack.",
      "After the fix, assert the re-entrant call reverts or pays nothing extra.",
      "Try cross-function paths: re-enter a different function that reads the same balance."
    ],
    falsePositives: [
      "Every function sharing the state is protected by nonReentrant.",
      "State is fully updated before the call (checks-effects-interactions).",
      "The call target is a fixed, trusted contract that cannot call back.",
      "The call uses transfer() or send() with the 2300 gas stipend. Re-entry is impractical today, though relying on gas costs is discouraged."
    ] },

  { id: "missing-access-control", name: "Missing access control", category: "Access control", severity: "Critical",
    keywords: "onlyOwner owner admin role permission unprotected setter takeover",
    definition: "A state-changing function that should be restricted can be called by anyone.",
    root: "The function has no check binding msg.sender to an authorized role.",
    vuln: { file: "Admin.sol", hot: 3, code: `
address public owner;

function setOwner(address newOwner) external {
  owner = newOwner;
}` },
    conditions: [
      "A function changes privileged state: owner, roles, prices, pause state, or where funds go.",
      "It has no modifier or require restricting the caller."
    ],
    sequence: [
      "Attacker calls the unprotected function directly.",
      "Attacker makes themselves owner or changes a critical parameter.",
      "Attacker uses the new privilege, for example sweep(), to take funds."
    ],
    impact: "Full protocol takeover and loss of the funds it controls.",
    mitigation: "Restrict privileged functions with onlyOwner or role-based access control, and validate new values.",
    secure: { file: "Admin.sol", hot: 3, code: `
address public owner;

function setOwner(address newOwner) external onlyOwner {
  require(newOwner != address(0), "zero owner");
  owner = newOwner;
}` },
    testing: [
      "For every privileged function, a test where an unrelated address calls it under vm.expectRevert.",
      "Fuzz the caller address to confirm only authorized roles succeed.",
      "Check the constructor or initializer: is the owner actually set?"
    ],
    falsePositives: [
      "The function is intentionally permissionless and harmless, such as a poke() that only updates an index.",
      "Protection lives inside the body or in an internal function it calls.",
      "The function is internal or private and only reachable through checked entry points."
    ] },

  { id: "broken-authorization", name: "Broken authorization", category: "Access control", severity: "High",
    keywords: "authorization approval operator transferFrom wrong check parameter",
    definition: "A check exists but verifies the wrong thing: a parameter instead of the caller, the wrong mapping, or a condition that is always true.",
    root: "The authorization check does not tie the action to msg.sender's actual rights.",
    vuln: { file: "NFT.sol", hot: 2, code: `
function transferFrom(address from, address to, uint256 id) external {
  require(ownerOf[id] == from, "not owner");
  ownerOf[id] = to;
}` },
    conditions: [
      "The check validates a value the attacker can supply as an argument.",
      "No other check binds msg.sender to that value."
    ],
    sequence: [
      "Attacker finds a victim's token id.",
      "Attacker calls transferFrom(victim, attacker, id).",
      "The check passes, because the victim really owns the token.",
      "The token is reassigned to the attacker."
    ],
    impact: "Theft of any user's assets.",
    mitigation: "Require msg.sender to be the owner or an approved operator before moving assets.",
    secure: { file: "NFT.sol", hot: 3, code: `
function transferFrom(address from, address to, uint256 id) external {
  require(ownerOf[id] == from, "not owner");
  require(msg.sender == from || isApproved[from][msg.sender], "not allowed");
  ownerOf[id] = to;
}` },
    testing: [
      "Call the function as an unrelated address with another user's data and expect a revert.",
      "Test approved and unapproved operators separately."
    ],
    falsePositives: [
      "The parameter is bound to the caller elsewhere, for example by a verified signature.",
      "Only a trusted router can call the function, and it enforces authorization."
    ] },

  { id: "tx-origin", name: "tx.origin authorization", category: "Access control", severity: "High",
    keywords: "tx.origin msg.sender phishing intermediate contract",
    definition: "Authorization compares tx.origin, the wallet that started the transaction, instead of msg.sender, the immediate caller.",
    root: "tx.origin stays the same through every contract in a call chain, so a malicious intermediate contract inherits the victim's authority.",
    vuln: { file: "Wallet.sol", hot: 2, code: `
function transfer(address payable to, uint256 amount) external {
  require(tx.origin == owner, "not owner");
  to.transfer(amount);
}` },
    conditions: [
      "Authorization uses tx.origin.",
      "The privileged user can be persuaded to call an attacker-controlled contract."
    ],
    sequence: [
      "Attacker deploys a contract that calls Wallet.transfer(attacker, balance).",
      "Attacker lures the owner into calling it, for example as a fake airdrop claim.",
      "Inside that call, tx.origin is the owner, so the check passes.",
      "The wallet's funds are sent to the attacker."
    ],
    impact: "Loss of everything the privileged account controls.",
    mitigation: "Use msg.sender for authorization.",
    secure: { file: "Wallet.sol", hot: 2, code: `
function transfer(address payable to, uint256 amount) external {
  require(msg.sender == owner, "not owner");
  to.transfer(amount);
}` },
    testing: [
      "Call through an intermediate contract while the owner is tx.origin (vm.prank(sender, origin)) and expect a revert."
    ],
    falsePositives: [
      "require(tx.origin == msg.sender) used only to reject contract callers. That is a design choice with trade-offs, not an authorization bypass."
    ] },

  { id: "unchecked-call", name: "Unchecked external call", category: "External calls", severity: "Medium",
    keywords: "send call return value bool ignored safeTransfer erc20 false",
    definition: "A low-level call or token transfer fails by returning false, and the code ignores the result.",
    root: "The boolean result of call, send, or a non-reverting token transfer is never checked.",
    vuln: { file: "Lottery.sol", hot: 4, code: `
function payWinner(address payable winner) external {
  require(!paid, "already paid");
  paid = true;
  winner.send(prize);
}` },
    conditions: [
      "The code uses send, call, or a token whose transfer returns false instead of reverting.",
      "The return value is ignored.",
      "State already records the operation as done."
    ],
    sequence: [
      "The recipient is a contract that rejects ETH, or the call runs out of gas.",
      "send() returns false.",
      "Execution continues and records success.",
      "Funds stay in the contract and the user can never claim them."
    ],
    impact: "Lost or stuck funds and broken accounting.",
    mitigation: "Check every return value (or use SafeERC20), or record what is owed and let users withdraw.",
    secure: { file: "Lottery.sol", hot: 5, code: `
function payWinner(address payable winner) external {
  require(!paid, "already paid");
  paid = true;
  (bool ok, ) = winner.call{value: prize}("");
  require(ok, "payment failed");
}` },
    testing: [
      "Pay a recipient contract whose receive() always reverts, and assert the call reverts or the debt stays recorded.",
      "For tokens, use a mock token that returns false instead of reverting."
    ],
    falsePositives: [
      "The result is checked through SafeERC20 or an explicit require.",
      "Failure is deliberately tolerated and the amount owed is kept for a later withdrawal."
    ] },

  { id: "accounting-errors", name: "Integer and accounting errors", category: "Arithmetic & accounting", severity: "High",
    keywords: "overflow underflow unchecked balance debit credit double counting",
    definition: "Value moves without the matching balance update, the wrong account is updated, or unchecked arithmetic wraps.",
    root: "The code's bookkeeping does not mirror the real movement of value.",
    vuln: { file: "Bank.sol", hot: 3, code: `
function withdraw(uint256 amount) external {
  require(balances[msg.sender] >= amount, "too much");
  totalDeposits -= amount;
  payable(msg.sender).transfer(amount);
}` },
    conditions: [
      "A value transfer has no matching debit or credit to the right account.",
      "Or arithmetic sits inside an unchecked block and can wrap.",
      "Or rounding consistently favors the caller."
    ],
    sequence: [
      "Deposit once.",
      "Call withdraw() repeatedly. The check keeps passing because the user's balance never decreases.",
      "Drain funds that belong to other users."
    ],
    impact: "Theft of funds or protocol insolvency.",
    mitigation: "Debit the caller's balance before sending value; keep every global total consistent with per-user balances.",
    secure: { file: "Bank.sol", hot: 3, code: `
function withdraw(uint256 amount) external {
  require(balances[msg.sender] >= amount, "too much");
  balances[msg.sender] -= amount;
  totalDeposits -= amount;
  payable(msg.sender).transfer(amount);
}` },
    testing: [
      "Invariant: the contract's balance is at least the sum of user balances.",
      "Fuzz sequences of deposits and withdrawals and compare expected and actual balances."
    ],
    falsePositives: [
      "The value is tracked in a different but equivalent variable.",
      "Overflow concerns in Solidity 0.8+ outside unchecked blocks: arithmetic already reverts."
    ] },

  { id: "unsafe-delegatecall", name: "Unsafe delegatecall", category: "External calls", severity: "Critical",
    keywords: "delegatecall storage context proxy arbitrary target",
    definition: "delegatecall to an address or with data the attacker controls runs foreign code with this contract's storage and balance.",
    root: "The delegatecall target or calldata is chosen by an untrusted caller.",
    vuln: { file: "Executor.sol", hot: 4, code: `
address public owner;

function execute(address target, bytes calldata data) external {
  (bool ok, ) = target.delegatecall(data);
  require(ok);
}` },
    conditions: [
      "The delegatecall target or data is attacker-controlled.",
      "There is no access control on the function."
    ],
    sequence: [
      "Attacker deploys a contract whose function writes storage slot 0.",
      "Attacker calls execute(evil, payload).",
      "Evil code runs in the victim's context and overwrites owner.",
      "Attacker drains funds through owner-only functions."
    ],
    impact: "Complete takeover of storage, ETH, and token approvals.",
    mitigation: "Never delegatecall to caller-supplied addresses. Use a fixed, trusted implementation behind access control.",
    secure: { file: "Executor.sol", hot: 4, code: `
address public immutable logic;

function execute(bytes calldata data) external onlyOwner {
  (bool ok, ) = logic.delegatecall(data);
  require(ok, "failed");
}` },
    testing: [
      "Deploy a malicious target in a test and assert that critical storage cannot change.",
      "Assert that only the owner can call execute()."
    ],
    falsePositives: [
      "The target is immutable, audited, and the function is restricted.",
      "A standard proxy delegates to a governed implementation."
    ] },

  { id: "denial-of-service", name: "Denial of service", category: "Availability", severity: "Medium",
    keywords: "dos gas limit loop unbounded push payment revert griefing frozen",
    definition: "An attacker makes a function unusable for everyone, temporarily or permanently.",
    root: "A required operation depends on something the attacker can force to fail, such as a reverting recipient or an unbounded loop.",
    vuln: { file: "Auction.sol", hot: 3, code: `
function bid() external payable {
  require(msg.value > highestBid, "too low");
  payable(highestBidder).transfer(highestBid);
  highestBidder = msg.sender;
  highestBid = msg.value;
}` },
    conditions: [
      "A required step makes a call that the attacker can make revert.",
      "Or a loop runs over a collection anyone can grow."
    ],
    sequence: [
      "Attacker bids from a contract whose receive() always reverts.",
      "Every later bid tries to refund the attacker and reverts.",
      "The attacker wins the auction at a low price."
    ],
    impact: "Frozen functionality and locked funds.",
    mitigation: "Use pull payments, and bound or paginate loops.",
    secure: { file: "Auction.sol", hot: 3, code: `
function bid() external payable {
  require(msg.value > highestBid, "too low");
  refunds[highestBidder] += highestBid;
  highestBidder = msg.sender;
  highestBid = msg.value;
}` },
    testing: [
      "Use a reverting recipient and assert that other users can still act.",
      "Grow arrays in a test and compare the gas used with the block gas limit."
    ],
    falsePositives: [
      "Only a trusted admin can grow the array.",
      "The loop is bounded by a small constant."
    ] },

  { id: "oracle-manipulation", name: "Oracle manipulation", category: "Oracles & pricing", severity: "Critical",
    keywords: "price spot reserves twap amm pool chainlink flash loan manipulation",
    definition: "A contract makes value decisions using a price that an attacker can move within a single transaction.",
    root: "The price comes from instantaneous state, such as pool reserves, that large trades can skew.",
    vuln: { file: "Lender.sol", hot: 2, code: `
function collateralValue(address user) public view returns (uint256) {
  (uint112 r0, uint112 r1, ) = pair.getReserves();
  uint256 price = uint256(r1) * 1e18 / r0;
  return deposits[user] * price / 1e18;
}` },
    conditions: [
      "The price comes from state that can move within one transaction.",
      "Enough capital is available, often through a flash loan.",
      "The protocol borrows, mints, or liquidates based on that price."
    ],
    sequence: [
      "Flash-borrow a large amount.",
      "Swap to skew the pool's reserves.",
      "Borrow or mint against the inflated price.",
      "Swap back and repay the loan.",
      "Keep the difference."
    ],
    impact: "Protocol drained of borrowable assets, leaving bad debt.",
    mitigation: "Use manipulation-resistant prices (decentralized feeds or long-window TWAPs) with staleness and deviation checks.",
    secure: { file: "Lender.sol", hot: 2, code: `
function collateralValue(address user) public view returns (uint256) {
  (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
  require(answer > 0 && block.timestamp - updatedAt < 1 hours, "bad price");
  return deposits[user] * uint256(answer) / 1e8;
}` },
    testing: [
      "On a local mainnet fork, perform a large swap before the price read and compare valuations.",
      "Assert that stale or non-positive prices revert."
    ],
    falsePositives: [
      "The price is a long-window TWAP over deep liquidity.",
      "The price is only displayed and never used for value decisions."
    ] },

  { id: "flash-loan", name: "Flash-loan attacks", category: "Governance", severity: "Critical",
    keywords: "flash loan governance vote snapshot balance borrowed capital",
    definition: "Flash loans give anyone a huge, uncollateralized balance for one transaction. They don't create bugs, but they make any bug that depends on holding a lot of tokens right now cheap to exploit.",
    root: "Decisions use current balances or spot prices, which borrowed capital can satisfy temporarily.",
    vuln: { file: "Governor.sol", hot: 2, code: `
function vote(uint256 id, bool support) external {
  uint256 weight = token.balanceOf(msg.sender);
  if (support) forVotes[id] += weight;
  else againstVotes[id] += weight;
}` },
    conditions: [
      "A flash-loanable asset influences a decision.",
      "The decision reads current state within the same transaction."
    ],
    sequence: [
      "Borrow a large amount of the asset.",
      "Use the temporary balance to vote, mint, borrow, or move a price.",
      "Take the profit.",
      "Repay the loan in the same transaction."
    ],
    impact: "Governance capture, manipulated prices, drained pools.",
    mitigation: "Use balances snapshotted at an earlier block, and add delays between voting and execution.",
    secure: { file: "Governor.sol", hot: 2, code: `
function vote(uint256 id, bool support) external {
  uint256 weight = token.getPastVotes(msg.sender, snapshotBlock[id]);
  if (support) forVotes[id] += weight;
  else againstVotes[id] += weight;
}` },
    testing: [
      "In a local test, give the attacker a temporary balance with deal(), act, and assert the decision is unaffected.",
      "Assert that votes use snapshot balances from before the proposal."
    ],
    falsePositives: [
      "Decisions use snapshots from earlier blocks.",
      "A multi-block delay or timelock makes single-transaction attacks impossible."
    ] },

  { id: "signature-replay", name: "Signature replay", category: "Signatures", severity: "High",
    keywords: "signature replay nonce eip-712 chain id domain separator permit",
    definition: "A valid signature can be used more than once, or on another chain or contract.",
    root: "The signed data lacks a nonce, chain ID, or contract address, and used signatures are not recorded.",
    vuln: { file: "Claims.sol", hot: 2, code: `
function claim(uint256 amount, bytes calldata sig) external {
  bytes32 h = keccak256(abi.encodePacked(msg.sender, amount));
  require(ECDSA.recover(toEthSigned(h), sig) == signer, "bad sig");
  payable(msg.sender).transfer(amount);
}` },
    conditions: [
      "The signed message has no nonce, chain ID, or contract address.",
      "The contract does not mark signatures or nonces as used."
    ],
    sequence: [
      "Obtain one valid signature.",
      "Submit it once, legitimately.",
      "Submit the same signature again, or on another chain or contract.",
      "Collect repeatedly."
    ],
    impact: "Repeated unauthorized payouts or actions.",
    mitigation: "Sign EIP-712 typed data that includes a nonce, the chain ID, and the contract address, and mark each nonce used.",
    secure: { file: "Claims.sol", hot: 2, code: `
function claim(uint256 amount, uint256 nonce, bytes calldata sig) external {
  require(!usedNonce[msg.sender][nonce], "used");
  bytes32 h = _hashTypedDataV4(keccak256(abi.encode(TYPEHASH, msg.sender, amount, nonce)));
  require(ECDSA.recover(h, sig) == signer, "bad sig");
  usedNonce[msg.sender][nonce] = true;
  payable(msg.sender).transfer(amount);
}` },
    testing: [
      "Submit the same signature twice in a test; the second call must revert.",
      "Change the chain ID with vm.chainId and assert the signature is rejected."
    ],
    falsePositives: [
      "A nonce or deadline is already included in the hashed data and enforced.",
      "The action is idempotent, so replaying it changes nothing."
    ] },

  { id: "signature-validation", name: "Incorrect signature validation", category: "Signatures", severity: "High",
    keywords: "ecrecover address(0) zero malleability invalid signature signer unset",
    definition: "The contract accepts signatures it should reject: invalid ones that recover to address(0), malleable ones, or checks against the wrong signer.",
    root: "Raw ecrecover output is not checked for address(0), or the expected signer can be zero.",
    vuln: { file: "Permit.sol", hot: 4, code: `
address public admin;   // set later

function act(bytes32 h, uint8 v, bytes32 r, bytes32 s) external {
  require(ecrecover(h, v, r, s) == admin, "bad sig");
  _privilegedAction();
}` },
    conditions: [
      "Raw ecrecover is used without rejecting address(0).",
      "The expected signer is unset, or the attacker controls the hash."
    ],
    sequence: [
      "Send v = 0 or random r and s values.",
      "ecrecover returns address(0).",
      "The comparison with the unset signer passes.",
      "The privileged action runs."
    ],
    impact: "Unauthorized minting, transfers, or admin actions.",
    mitigation: "Use OpenZeppelin ECDSA.recover, which reverts on invalid or malleable signatures, and never allow a zero signer.",
    secure: { file: "Permit.sol", hot: 4, code: `
address public immutable admin;   // set in constructor, non-zero

function act(bytes32 h, bytes calldata sig) external {
  require(ECDSA.recover(h, sig) == admin, "bad sig");
  _privilegedAction();
}` },
    testing: [
      "Call with an all-zero signature and expect a revert.",
      "Submit a malleated signature (high s value) and expect it to be rejected."
    ],
    falsePositives: [
      "OpenZeppelin ECDSA.recover is used.",
      "The signer is immutable and set to a non-zero address at construction."
    ] },

  { id: "precision-loss", name: "Precision loss", category: "Arithmetic & accounting", severity: "Medium",
    keywords: "rounding division before multiplication decimals dust truncation",
    definition: "Integer division discards remainders. Dividing early, or rounding in the user's favor, leaks value that can be farmed.",
    root: "Division happens before multiplication, or rounding direction favors the caller.",
    vuln: { file: "Fees.sol", hot: 2, code: `
function fee(uint256 amount) public view returns (uint256) {
  return amount / 10_000 * feeBps;
}` },
    conditions: [
      "Division precedes multiplication.",
      "Or rounding consistently favors the user.",
      "The attacker can repeat small operations cheaply."
    ],
    sequence: [
      "Split one large trade into many trades below the rounding threshold.",
      "Each trade pays a fee of 0.",
      "The protocol loses its fee revenue."
    ],
    impact: "Value leakage that can become insolvency at scale.",
    mitigation: "Multiply before dividing, use mulDiv for large values, and round in the protocol's favor.",
    secure: { file: "Fees.sol", hot: 2, code: `
function fee(uint256 amount) public view returns (uint256) {
  return amount * feeBps / 10_000;
}` },
    testing: [
      "Fuzz small amounts and assert fee > 0 whenever amount * feeBps >= 10,000.",
      "Compare results with a high-precision reference calculation."
    ],
    falsePositives: [
      "The loss is bounded to dust and cannot be repeated profitably after gas costs."
    ] },

  { id: "storage-collision", name: "Storage collision", category: "Upgradeability", severity: "High",
    keywords: "proxy upgrade storage layout slot collision gap namespaced erc-7201",
    definition: "After an upgrade, the new implementation reads existing storage slots with different meanings, corrupting state.",
    root: "State variables were reordered, removed, or retyped between versions that share the proxy's storage.",
    vuln: { file: "TokenV2.sol", hot: 2, code: `
contract TokenV2 {
  uint256 public fee;   // inserted first
  address public owner;
  mapping(address => uint256) public balances;
}` },
    conditions: [
      "The contract sits behind a proxy.",
      "The new version reorders, removes, or changes the type of existing variables.",
      "Or an inherited contract adds variables without a storage gap."
    ],
    sequence: [
      "The upgrade executes.",
      "New code reads old slots with new meanings.",
      "owner and balances read the wrong data or zero.",
      "Attackers may exploit a zeroed owner or corrupted values."
    ],
    impact: "Lost ownership, corrupted balances, possible takeover.",
    mitigation: "Only append new variables, use storage gaps or ERC-7201 namespaced storage, and validate layouts before upgrading.",
    secure: { file: "TokenV2.sol", hot: 4, code: `
contract TokenV2 {
  address public owner;
  mapping(address => uint256) public balances;
  uint256 public fee;   // appended at the end
}` },
    testing: [
      "Compare storage layouts between versions (forge inspect <Contract> storageLayout).",
      "Upgrade in a local fork test and assert owner and balances are unchanged."
    ],
    falsePositives: [
      "New variables are only appended after existing ones.",
      "Namespaced (ERC-7201) storage is used consistently."
    ] },

  { id: "initialization", name: "Initialization mistakes", category: "Upgradeability", severity: "Critical",
    keywords: "initializer initialize proxy uups front-run disableInitializers",
    definition: "An upgradeable contract's initializer can be called by an attacker, called twice, or is left uncalled on the implementation.",
    root: "The initializer lacks a run-once guard, or initialization is not atomic with deployment.",
    vuln: { file: "VaultV1.sol", hot: 1, code: `
function initialize(address _owner) external {
  owner = _owner;
  feeBps = 30;
}` },
    conditions: [
      "The initializer has no run-once guard.",
      "Or deployment and initialization happen in separate transactions.",
      "Or the implementation contract itself is never initialized."
    ],
    sequence: [
      "Watch for the proxy deployment.",
      "Call initialize(attacker) before the team does, or call it again later.",
      "Gain the owner role.",
      "Upgrade to malicious logic or withdraw funds."
    ],
    impact: "Takeover of the proxy or the implementation.",
    mitigation: "Use the initializer modifier, initialize atomically during deployment, and call _disableInitializers() in the implementation's constructor.",
    secure: { file: "VaultV1.sol", hot: 1, code: `
function initialize(address _owner) external initializer {
  __Ownable_init(_owner);
  feeBps = 30;
}` },
    testing: [
      "Call initialize() twice in a test; the second call must revert.",
      "Assert that calling initialize() on the implementation contract reverts."
    ],
    falsePositives: [
      "The deployment script initializes atomically and the initializer modifier is present."
    ] }
];
