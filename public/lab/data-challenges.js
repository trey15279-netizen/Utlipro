// SECURITY LAB Challenge Arena and Code Lab data.
// Each challenge: a snippet, one question with four choices, and the full analysis shown only after submission.
// `line` is the 1-based vulnerable line. `skill` is what the main question measures; the follow-up measures its own skill.
"use strict";

window.SL_TIERS = ["Beginner", "Intermediate", "Advanced", "Researcher"];

window.SL_CHALLENGES = [
  { id: "ch01", tier: 0, category: "External calls", guide: "reentrancy", skill: "code",
    file: "Rewards.sol", code: `
contract Rewards {
  mapping(address => uint256) public owed;

  function claim() external {
    uint256 amt = owed[msg.sender];
    require(amt > 0, "nothing owed");
    (bool ok, ) = msg.sender.call{value: amt}("");
    require(ok, "send failed");
    owed[msg.sender] = 0;
  }
}`,
    q: "Which line creates the reentrancy risk by handing over control too early?",
    options: ["Line 5: reading owed", "Line 6: the amount check", "Line 7: the external call made before owed is cleared", "Line 9: clearing owed"], answer: 2, line: 7,
    root: "owed[msg.sender] is cleared on line 9, after the external call on line 7 has already handed control to the caller.",
    pre: ["Attacker has a non-zero owed balance.", "Attacker claims through a contract whose receive() re-enters claim()."],
    path: ["Call claim() from the attack contract.", "Line 7 sends ETH and runs the attacker's receive().", "receive() calls claim() again; owed is unchanged.", "Repeat until the contract is empty."],
    impact: "All ETH held by Rewards can be drained.", severity: "Critical",
    mitigation: "Set owed[msg.sender] = 0 before the call (checks-effects-interactions) and add a nonReentrant guard.",
    follow: { q: "After moving line 9 above line 7, what should your test assert when the attacker re-enters?",
      options: ["The contract is empty", "The re-entrant claim gets nothing: amt is 0, so it reverts", "An event is emitted twice"], answer: 1, skill: "testing" } },

  { id: "ch02", tier: 0, category: "Access control", guide: "missing-access-control", skill: "recognition",
    file: "FeeVault.sol", code: `
contract FeeVault {
  address public owner;
  address public treasury;

  constructor() { owner = msg.sender; treasury = msg.sender; }

  function setTreasury(address t) external {
    treasury = t;
  }

  function collect() external {
    payable(treasury).transfer(address(this).balance);
  }
}`,
    q: "What is the most serious problem in FeeVault?",
    options: ["collect() should be payable", "Anyone can redirect all fees by calling setTreasury()", "owner is public", "The constructor sets two variables"], answer: 1, line: 7,
    root: "setTreasury() decides where all funds go but has no access control.",
    pre: ["None beyond sending a transaction."],
    path: ["Attacker calls setTreasury(attacker).", "Anyone, including the attacker, calls collect().", "All accumulated fees are sent to the attacker."],
    impact: "All collected fees stolen.", severity: "High",
    mitigation: "Restrict setTreasury() with onlyOwner and reject address(0).",
    follow: { q: "Which test proves the fix?",
      options: ["A random address calls setTreasury() under vm.expectRevert", "collect() sends ETH to the treasury", "The owner can read treasury"], answer: 0, skill: "testing" } },

  { id: "ch03", tier: 0, category: "Access control", guide: "tx-origin", skill: "recognition",
    file: "SimpleWallet.sol", code: `
contract SimpleWallet {
  address public owner = msg.sender;

  function pay(address payable to, uint256 amt) external {
    require(tx.origin == owner, "only owner");
    to.transfer(amt);
  }

  receive() external payable {}
}`,
    q: "How could an attacker get paid from this wallet?",
    options: ["Call pay() directly from their own wallet", "Trick the owner into calling a malicious contract that calls pay()", "Send ETH to receive()", "Guess the owner's private key"], answer: 1, line: 5,
    root: "Authorization uses tx.origin, which remains the owner through any intermediate contract.",
    pre: ["The owner can be persuaded to call an attacker-controlled contract."],
    path: ["Attacker deploys a contract that calls wallet.pay(attacker, balance).", "The owner is lured into calling it.", "tx.origin == owner, so line 5 passes.", "The wallet balance is sent to the attacker."],
    impact: "Entire wallet balance stolen.", severity: "High",
    mitigation: "Authorize with msg.sender == owner.",
    follow: { q: "Which Foundry cheatcode sets both msg.sender and tx.origin for the next call?",
      options: ["vm.prank(sender, origin)", "vm.deal(addr, amount)", "vm.warp(timestamp)"], answer: 0, skill: "testing" } },

  { id: "ch04", tier: 0, category: "External calls", guide: "unchecked-call", skill: "recognition",
    file: "Payroll.sol", code: `
contract Payroll {
  mapping(address => uint256) public salary;
  mapping(address => bool) public paidThisMonth;

  function pay(address payable worker) external onlyOwner {
    require(!paidThisMonth[worker], "paid");
    paidThisMonth[worker] = true;
    worker.send(salary[worker]);
  }
}`,
    q: "What happens if worker.send() fails?",
    options: ["The transaction reverts", "The worker is marked as paid but receives nothing", "send() retries automatically", "The salary doubles"], answer: 1, line: 8,
    root: "The boolean returned by send() is ignored, and paidThisMonth is already set.",
    pre: ["The worker's address rejects ETH or needs more than send()'s 2300 gas, as many smart wallets do."],
    path: ["Owner calls pay(worker).", "paidThisMonth[worker] is set to true.", "send() fails and returns false.", "Execution continues; the worker cannot be paid again this month."],
    impact: "Workers lose their salary; funds remain stuck until handled manually.", severity: "Medium",
    mitigation: "Use call and require success, or record the amount owed and let workers withdraw it.",
    follow: { q: "Which recipient would trigger this bug in a test?",
      options: ["A contract whose receive() always reverts", "An EOA with no ETH", "The owner"], answer: 0, skill: "testing" } },

  { id: "ch05", tier: 1, category: "Access control", guide: "broken-authorization", skill: "code",
    file: "Escrow.sol", code: `
contract Escrow {
  mapping(uint256 => address) public depositor;
  mapping(uint256 => uint256) public amount;

  function refund(uint256 id, address to) external {
    require(depositor[id] != address(0), "no deposit");
    uint256 a = amount[id];
    amount[id] = 0;
    payable(to).transfer(a);
  }
}`,
    q: "Which statement about refund() is true?",
    options: ["It is safe because it checks the deposit exists", "Anyone can refund any deposit to their own address", "Only the depositor can call it", "It is reentrant because the transfer comes before the update"], answer: 1, line: 6,
    root: "The check confirms a deposit exists but never ties msg.sender to depositor[id], and funds go to an arbitrary address.",
    pre: ["At least one deposit exists."],
    path: ["Attacker reads deposit ids from events or storage.", "Attacker calls refund(id, attacker) for each id.", "Every deposit is sent to the attacker."],
    impact: "All escrowed funds stolen.", severity: "Critical",
    mitigation: "require(msg.sender == depositor[id]) and refund the depositor, not a caller-chosen address.",
    follow: { q: "Option D claimed reentrancy. Why is that wrong here?",
      options: ["amount[id] is zeroed before the transfer, and transfer forwards only 2300 gas", "transfer cannot send ETH", "refund() is a view function"], answer: 0, skill: "exploit" } },

  { id: "ch06", tier: 1, category: "Availability", guide: "denial-of-service", skill: "exploit",
    file: "Airdrop.sol", code: `
contract Airdrop {
  address[] public recipients;

  function register() external {
    recipients.push(msg.sender);
  }

  function distribute() external onlyOwner {
    for (uint256 i = 0; i < recipients.length; i++) {
      token.transfer(recipients[i], 100e18);
    }
  }
}`,
    q: "How can an attacker stop the airdrop for everyone?",
    options: ["Call distribute() first", "Register enough addresses that the loop exceeds the block gas limit", "Send tokens to the contract", "Call register() once"], answer: 1, line: 9,
    root: "distribute() loops over an array that anyone can grow without limit.",
    pre: ["register() is open to anyone.", "Each registration costs the attacker only gas."],
    path: ["Attacker calls register() many times, from one or many addresses.", "recipients grows very large.", "distribute() needs more gas than a block allows.", "Every call reverts; nobody receives tokens."],
    impact: "The airdrop is permanently blocked. Duplicate registrations also claim extra tokens.", severity: "Medium",
    mitigation: "Use a claim-based (pull) design such as a Merkle claim, and prevent duplicate registration.",
    follow: { q: "Which test demonstrates the issue?",
      options: ["Register many addresses, then show distribute() needs more gas than the block limit", "Call distribute() with one recipient", "Check the token's decimals"], answer: 0, skill: "testing" } },

  { id: "ch07", tier: 1, category: "Arithmetic & accounting", guide: "accounting-errors", skill: "code",
    file: "Staking.sol", code: `
contract Staking {
  mapping(address => uint256) public staked;
  uint256 public totalStaked;

  function unstake(uint256 amt) external {
    require(staked[msg.sender] >= amt, "too much");
    totalStaked -= amt;
    token.transfer(msg.sender, amt);
  }
}`,
    q: "Which line is missing from unstake()?",
    options: ["staked[msg.sender] -= amt;", "totalStaked += amt;", "require(amt > 0);", "emit Unstaked(amt);"], answer: 0, line: 7,
    root: "unstake() never reduces staked[msg.sender], so the check on line 6 passes forever.",
    pre: ["Attacker has any stake."],
    path: ["Stake 10 tokens.", "Call unstake(10) repeatedly.", "Each call passes line 6 and transfers 10 more tokens.", "Continue until totalStaked would underflow or the pool is empty."],
    impact: "Theft of other users' staked tokens.", severity: "Critical",
    mitigation: "Debit staked[msg.sender] before transferring tokens.",
    follow: { q: "Which invariant would catch this bug?",
      options: ["The contract's token balance is at least the sum of all staked balances", "totalStaked is greater than 0", "owner never changes"], answer: 0, skill: "testing" } },

  { id: "ch08", tier: 1, category: "External calls", guide: "unsafe-delegatecall", skill: "recognition",
    file: "Router.sol", code: `
contract Router {
  address public owner;

  constructor() { owner = msg.sender; }

  function multicall(address impl, bytes calldata data) external {
    (bool ok, ) = impl.delegatecall(data);
    require(ok, "failed");
  }

  function withdraw() external {
    require(msg.sender == owner);
    payable(owner).transfer(address(this).balance);
  }
}`,
    q: "What can an attacker achieve through multicall()?",
    options: ["Nothing, because withdraw() is protected", "Run their own code with Router's storage and become owner", "Only waste gas", "Read private variables"], answer: 1, line: 7,
    root: "delegatecall to a caller-supplied address, with no access control.",
    pre: ["Attacker can deploy a contract."],
    path: ["Deploy Evil with a function that writes the caller into storage slot 0.", "Call multicall(evil, data).", "Router's owner (slot 0) becomes the attacker.", "Call withdraw()."],
    impact: "Full takeover and theft of all ETH.", severity: "Critical",
    mitigation: "Remove arbitrary delegatecall, or restrict it to an immutable allowlisted implementation callable only by the owner.",
    follow: { q: "Why does writing slot 0 in Evil change Router's owner?",
      options: ["delegatecall runs Evil's code against Router's storage, where owner is slot 0", "Evil calls Router.setOwner()", "Solidity copies storage back after every call"], answer: 0, skill: "exploit" } },

  { id: "ch09", tier: 2, category: "Oracles & pricing", guide: "oracle-manipulation", skill: "exploit",
    file: "Lend.sol", code: `
contract Lend {
  function maxBorrow(address user) public view returns (uint256) {
    uint256 ethPrice = usdc.balanceOf(address(pool)) * 1e18
                       / weth.balanceOf(address(pool));
    return collateralEth[user] * ethPrice / 1e18 / 2;
  }
}`,
    q: "What lets an attacker borrow far more than their collateral is worth?",
    options: ["Dividing by 2", "The price comes from the pool's current token balances, which one large swap can skew", "maxBorrow() is a view function", "The 1e18 scaling"], answer: 1, line: 3,
    root: "The price is derived from instantaneous pool balances that can be moved within a single transaction.",
    pre: ["Enough capital, typically a flash loan, to move the pool significantly.", "Lend holds assets worth borrowing."],
    path: ["Flash-borrow a large amount of USDC.", "Swap USDC into the pool for WETH: the pool holds more USDC and less WETH, so ethPrice rises.", "Borrow against collateral at the inflated price.", "Swap back, repay the flash loan, and keep the excess."],
    impact: "The lending pool is drained, leaving bad debt.", severity: "Critical",
    mitigation: "Use a manipulation-resistant oracle (decentralized feed or long-window TWAP) with staleness and deviation checks.",
    follow: { q: "Where should you demonstrate this attack?",
      options: ["In a Foundry test on a local mainnet fork", "Against the live pool with real funds", "With a screenshot of the pool"], answer: 0, skill: "testing" } },

  { id: "ch10", tier: 2, category: "Signatures", guide: "signature-replay", skill: "exploit",
    file: "Voucher.sol", code: `
contract Voucher {
  address public signer;

  function redeem(address to, uint256 amount, bytes calldata sig) external {
    bytes32 digest = keccak256(abi.encodePacked(to, amount));
    bytes32 signed = MessageHashUtils.toEthSignedMessageHash(digest);
    require(ECDSA.recover(signed, sig) == signer, "bad sig");
    token.mint(to, amount);
  }
}`,
    q: "A user received one valid voucher. What can they do?",
    options: ["Redeem it exactly once", "Redeem the same voucher again and again", "Change the amount without breaking the signature", "Nothing until the signer approves"], answer: 1, line: 5,
    root: "The signed digest has no nonce, chain ID, or contract address, and used vouchers are never recorded.",
    pre: ["The attacker holds one valid signature."],
    path: ["Call redeem(to, amount, sig).", "Call it again with the same arguments.", "Each call mints another amount of tokens."],
    impact: "Unlimited minting; the token's value collapses.", severity: "Critical",
    mitigation: "Sign EIP-712 data with a nonce, the chain ID, and the contract address, and mark each nonce as used.",
    follow: { q: "Which test proves the fix?",
      options: ["Redeem once, then expect a revert when the same signature is redeemed again", "Redeem with a wrong signature", "Check that totalSupply is public"], answer: 0, skill: "testing" } },

  { id: "ch11", tier: 2, category: "Signatures", guide: "signature-validation", skill: "recognition",
    file: "Permit.sol", code: `
contract Permit {
  address public admin;   // set later by setAdmin()

  function act(bytes32 h, uint8 v, bytes32 r, bytes32 s) external {
    require(ecrecover(h, v, r, s) == admin, "bad sig");
    _privilegedAction();
  }
}`,
    q: "Before setAdmin() is called, what does an attacker need to pass the check?",
    options: ["The admin's private key", "Any invalid signature, because ecrecover returns address(0) and admin is address(0)", "A valid nonce", "Some ETH"], answer: 1, line: 5,
    root: "ecrecover returns address(0) for invalid input, and admin is still address(0).",
    pre: ["admin has not been set.", "h, v, r and s are fully attacker-controlled."],
    path: ["Call act() with v = 0 and arbitrary r and s.", "ecrecover returns address(0).", "address(0) == admin, so the check passes.", "The privileged action runs."],
    impact: "Unauthorized privileged actions.", severity: "High",
    mitigation: "Set admin at construction, reject address(0), and use OpenZeppelin ECDSA.recover, which reverts on invalid signatures.",
    follow: { q: "What should the proof of concept assert?",
      options: ["The privileged action took effect for a caller with no valid signature", "admin is not address(0)", "gasleft() is above zero"], answer: 0, skill: "testing" } },

  { id: "ch12", tier: 2, category: "Arithmetic & accounting", guide: "precision-loss", skill: "code",
    file: "RewardPool.sol", code: `
contract RewardPool {
  uint256 public rewardPerShare;   // not scaled

  function notify(uint256 reward) external onlyOwner {
    rewardPerShare += reward / totalShares;
  }

  function pending(address u) public view returns (uint256) {
    return shares[u] * rewardPerShare;
  }
}`,
    q: "totalShares is 1e24 and the owner notifies a reward of 5e23. What happens?",
    options: ["Rewards are distributed correctly", "reward / totalShares rounds to 0, so nothing is ever distributed", "pending() reverts", "rewardPerShare overflows"], answer: 1, line: 5,
    root: "Integer division without scaling: whenever reward is smaller than totalShares, the increment is 0.",
    pre: ["A large share supply relative to reward amounts, which is common with 18-decimal tokens."],
    path: ["The owner notifies a reward smaller than totalShares.", "rewardPerShare increases by 0.", "Reward tokens sit in the contract and can never be claimed."],
    impact: "Rewards are permanently lost; stakers earn nothing.", severity: "Medium",
    mitigation: "Scale before dividing: rewardPerShare += reward * 1e18 / totalShares, and divide by 1e18 in pending().",
    follow: { q: "Which fuzz test would catch this?",
      options: ["Fuzz reward and totalShares, and assert total claimable rewards stay within a small tolerance of reward", "Fuzz the owner address", "Fuzz only block.timestamp"], answer: 0, skill: "testing" } },

  { id: "ch13", tier: 3, category: "Upgradeability", guide: "initialization", skill: "exploit",
    file: "VaultV1.sol", code: `
// Deploy script: deploy proxy, then call initialize() in a separate transaction.
contract VaultV1 is UUPSUpgradeable {
  address public owner;

  function initialize(address _owner) public {
    owner = _owner;
  }

  function _authorizeUpgrade(address) internal override {
    require(msg.sender == owner, "not owner");
  }
}`,
    q: "What is the most serious risk?",
    options: ["UUPS proxies are deprecated", "initialize() can be front-run or called again, giving the attacker ownership and upgrade rights", "owner is public", "_authorizeUpgrade() is internal"], answer: 1, line: 5,
    root: "initialize() has no run-once guard, and it is called in a separate transaction from deployment.",
    pre: ["The attacker reaches the proxy before initialization, or simply calls initialize() again later."],
    path: ["Call initialize(attacker) on the proxy.", "owner becomes the attacker.", "Call upgradeToAndCall() with a malicious implementation.", "Drain funds through the new logic."],
    impact: "Full takeover of the proxy and its funds.", severity: "Critical",
    mitigation: "Use the initializer modifier, initialize atomically during deployment, and call _disableInitializers() in the implementation's constructor.",
    follow: { q: "Which test proves the guard works?",
      options: ["Call initialize() a second time and expect a revert", "Read owner()", "Upgrade without calling initialize()"], answer: 0, skill: "testing" } },

  { id: "ch14", tier: 3, category: "Upgradeability", guide: "storage-collision", skill: "code",
    file: "Token.sol", code: `
// Deployed behind a proxy
contract TokenV1 {
  address public owner;
  mapping(address => uint256) public balances;
}

contract TokenV2 {
  uint256 public fee;
  address public owner;
  mapping(address => uint256) public balances;
}`,
    q: "The proxy is upgraded from TokenV1 to TokenV2. What breaks?",
    options: ["Nothing, because the names match", "fee takes slot 0, so owner and balances shift to new slots and read the wrong data", "Only events break", "The proxy can no longer receive ETH"], answer: 1, line: 8,
    root: "A new variable was inserted before the existing ones, changing every later storage slot.",
    pre: ["The upgrade to TokenV2 is executed by the owner or governance."],
    path: ["The upgrade executes.", "fee reads the old owner slot; owner reads slot 1, the old mapping's empty base slot, so it is address(0).", "balances now hashes from slot 2: every user balance reads 0.", "Ownership and all balances are effectively lost."],
    impact: "Ownership lost and every balance appears wiped.", severity: "High",
    mitigation: "Only append new variables after existing ones; use storage gaps or ERC-7201 namespaced storage; validate layouts before upgrading.",
    follow: { q: "Which check catches this before the upgrade ships?",
      options: ["Compare the V1 and V2 storage layouts with forge inspect or an upgrade-safety validator", "Run the deploy script twice", "Check the compiler version"], answer: 0, skill: "testing" } },

  { id: "ch15", tier: 3, category: "Governance", guide: "flash-loan", skill: "exploit",
    file: "Governor.sol", code: `
contract Governor {
  function vote(uint256 id, bool support) external {
    uint256 weight = token.balanceOf(msg.sender);
    require(!voted[id][msg.sender], "voted");
    voted[id][msg.sender] = true;
    if (support) forVotes[id] += weight; else againstVotes[id] += weight;
  }

  function execute(uint256 id) external {
    require(forVotes[id] > againstVotes[id] && forVotes[id] >= QUORUM);
    _run(id);
  }
}`,
    q: "How could an attacker pass any proposal without owning tokens?",
    options: ["Vote twice from the same address", "Flash-borrow tokens, vote with the current balance, execute, and repay in one transaction", "Call execute() before anyone votes", "Front-run another voter"], answer: 1, line: 3,
    root: "Voting weight is the current token balance, not a snapshot from before the proposal.",
    pre: ["A flash loan of the governance token is available.", "No voting delay prevents voting and executing in the same transaction."],
    path: ["Flash-borrow a quorum of tokens.", "Call vote(id, true).", "Call execute(id) immediately.", "Repay the loan in the same transaction."],
    impact: "Arbitrary proposals executed: treasury theft or protocol takeover.", severity: "Critical",
    mitigation: "Use checkpointed voting power from a past block (ERC20Votes getPastVotes), plus a voting delay and a timelock.",
    follow: { q: "Why does a snapshot from a past block stop this?",
      options: ["The flash-loaned tokens were not in the voter's balance at that past block", "Snapshots are encrypted", "Past blocks forbid flash loans"], answer: 0, skill: "exploit" } },

  { id: "ch16", tier: 3, category: "Review judgment", guide: "reentrancy", skill: "recognition",
    file: "SafeBank.sol", code: `
contract SafeBank is ReentrancyGuard {
  mapping(address => uint256) public balances;

  function withdraw(uint256 amt) external nonReentrant {
    balances[msg.sender] -= amt;
    (bool ok, ) = msg.sender.call{value: amt}("");
    require(ok, "send failed");
  }

  function deposit() external payable {
    balances[msg.sender] += msg.value;
  }
}`,
    q: "A junior auditor reports \"Critical: reentrancy in withdraw()\". What is your assessment?",
    options: ["Correct: any external call is reentrancy", "False positive: the balance is debited before the call, and withdraw() is nonReentrant", "Correct, because deposit() is not guarded", "It is an overflow bug instead"], answer: 1, line: 6,
    root: "No exploitable root cause. State is updated before the external call, withdraw() is guarded, and line 5 reverts on underflow in Solidity 0.8.",
    pre: ["None that lead to a loss."],
    path: ["The attacker re-enters from receive().", "withdraw() is blocked by nonReentrant.", "deposit() can be re-entered, but it only credits ETH the attacker actually sends.", "No extra value can be extracted."],
    impact: "None. Close the report as a false positive.", severity: "None",
    mitigation: "No code change is needed. Reply explaining why the finding is invalid: the debit on line 5 happens before the call, and nonReentrant blocks re-entry.",
    follow: { q: "Which test would confirm it is a false positive?",
      options: ["An attacker contract re-enters withdraw(); assert the re-entry fails and no extra ETH leaves", "A test that deposits once", "Check that ReentrancyGuard is imported"], answer: 0, skill: "testing" } }
];

// Code Lab: the SimpleVault review exercise. Line notes appear when a line is tapped.
window.SL_CODELAB = {
  vulnerable: { file: "SimpleVault.sol", code: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SimpleVault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        balances[msg.sender] = 0;
    }
}`,
    marks: { 13: "danger", 15: "danger" },
    notes: {
      5: "State: each depositor's balance. This is the value an attacker wants to reuse.",
      7: "Entry point. Anyone can deposit ETH and be credited.",
      8: "Credit: the balance increases by the ETH sent.",
      11: "Entry point. Anyone with a balance can call withdraw(). No reentrancy guard.",
      12: "Check: read the caller's balance. Nothing is changed yet.",
      13: "Interaction BEFORE effect. Sending ETH with call runs the caller's receive() function. If the caller is a contract, it can call withdraw() again right here, and line 12 will read the same, unchanged balance.",
      14: "Reverts if the transfer failed. It does not stop re-entry.",
      15: "Effect AFTER interaction. The balance is zeroed only after control came back from the external call, too late to stop a re-entrant withdrawal."
    } },
  fixed: { file: "SimpleVault.sol (fixed)", code: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SimpleVault is ReentrancyGuard {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        balances[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }
}`,
    marks: { 13: "safe", 16: "safe", 17: "accent" },
    notes: {
      4: "OpenZeppelin's ReentrancyGuard provides the nonReentrant modifier.",
      13: "nonReentrant: a second entry into withdraw() during the call reverts.",
      14: "Check: read the balance.",
      15: "Check: refuse empty withdrawals.",
      16: "Effect FIRST: the balance is zeroed before any external code runs. A re-entrant call would see 0.",
      17: "Interaction LAST: the external call happens only after state is consistent.",
      18: "Reverts the whole withdrawal, including line 16, if the transfer fails, so no funds are lost."
    } },
  test: `
// Reference test (Foundry). Shown for study; it is NOT executed in this browser.
contract Attacker {
    SimpleVault vault;
    constructor(SimpleVault v) { vault = v; }

    function attack() external payable {
        vault.deposit{value: msg.value}();
        vault.withdraw();
    }

    receive() external payable {
        if (address(vault).balance >= 1 ether) {
            try vault.withdraw() {} catch {}
        }
    }
}

function test_HonestFundsSurviveReentrancy() public {
    vm.deal(alice, 10 ether);
    vm.prank(alice);
    vault.deposit{value: 10 ether}();

    Attacker a = new Attacker(vault);
    a.attack{value: 1 ether}();

    assertEq(address(vault).balance, 10 ether, "honest funds must remain");
}`
};
