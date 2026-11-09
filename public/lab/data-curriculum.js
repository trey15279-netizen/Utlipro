// SECURITY LAB curriculum: 7 levels of smart-contract security training.
// Writing rules:
//   - Each lesson teaches ONE idea in six short steps:
//     concept → visual → code → important line → why it matters → check.
//   - {{key}} or {{key|shown text}} links a word to the glossary below (tap for a definition).
//   - code is a template string; `hot` is the 1-based line number that matters.
//   - flow is a vertical diagram: plain strings are boxes, "→ ..." strings are arrow labels,
//     a leading "!" marks a dangerous box, a leading "+" marks a safe box.
//   - Lessons with `guide` reuse that Field Guide entry for the visual, code and impact.
"use strict";

window.SL_GLOSSARY = {
  "smart contract": ["Smart contract", "A program stored on a blockchain. Its code and data are public, and anyone can call its external functions."],
  "state variable": ["State variable", "Data a contract keeps permanently in storage, such as balances or the owner."],
  "function": ["Function", "A named piece of contract code that can be called, with inputs and outputs."],
  "transaction": ["Transaction", "A signed request from an account to send value or call a contract. It changes on-chain state when included in a block."],
  "visibility": ["Visibility", "A keyword (public, external, internal, private) that controls who can call a function or see a variable in code."],
  "public": ["public", "Callable from outside and from inside the contract. For variables, Solidity also creates a getter."],
  "external": ["external", "Callable only from outside the contract (other accounts or contracts). An entry point."],
  "internal": ["internal", "Callable only from this contract and contracts that inherit from it."],
  "private": ["private", "Callable only from this contract. Note: private data is still readable by anyone on-chain."],
  "mapping": ["Mapping", "A key → value lookup table, like address → balance. Every key exists and starts at zero."],
  "struct": ["Struct", "A custom type that groups related fields, such as an order's buyer and amount."],
  "array": ["Array", "An ordered list. Dynamic arrays can grow, which can make loops over them expensive."],
  "event": ["Event", "A log entry written by a contract. Off-chain tools read events; contracts cannot."],
  "modifier": ["Modifier", "Reusable code wrapped around a function, usually a check such as onlyOwner."],
  "msg.sender": ["msg.sender", "The address that directly called the current function. The basis of most access control."],
  "msg.value": ["msg.value", "The amount of ether (in wei) sent along with the current call."],
  "require": ["require()", "Checks a condition. If it is false, the call reverts and every change is undone."],
  "revert": ["revert()", "Stops execution and undoes all state changes in the call, with an error message."],
  "evm": ["EVM", "The Ethereum Virtual Machine: the computer every node runs to execute contract code identically."],
  "gas": ["Gas", "The unit that measures computation cost. The sender pays for gas; running out reverts the call."],
  "storage": ["Storage", "Permanent contract data on-chain. Expensive to write, kept between transactions."],
  "memory": ["Memory", "Temporary data that exists only during one function call."],
  "calldata": ["Calldata", "The read-only input data sent with a call."],
  "address": ["Address", "A 20-byte identifier for an account: either a person's wallet or a contract."],
  "eoa": ["EOA", "Externally owned account: a wallet controlled by a private key, not by code."],
  "constructor": ["Constructor", "Code that runs once, when a contract is deployed, to set initial state."],
  "external call": ["External call", "A call from one contract into another. The other contract's code runs and can call back."],
  "mempool": ["Mempool", "The public waiting area for transactions that are not yet in a block."],
  "front-running": ["Front-running", "Seeing a pending transaction and getting your own transaction ordered before it."],
  "reentrancy": ["Reentrancy", "When an external call lets the callee call back into a function before the first call has finished updating state."],
  "cei": ["Checks-effects-interactions", "A safe ordering: check conditions, update your own state, and only then call other contracts."],
  "access control": ["Access control", "Rules that decide which addresses may call which functions."],
  "tx.origin": ["tx.origin", "The wallet that started the whole transaction, even through several contracts. Unsafe for authorization."],
  "delegatecall": ["delegatecall", "Runs another contract's code inside the caller's storage and balance, as if it were the caller's own code."],
  "oracle": ["Oracle", "A source of outside data, such as a price, that a contract relies on."],
  "flash loan": ["Flash loan", "An uncollateralized loan that must be borrowed and repaid within one transaction."],
  "foundry": ["Foundry", "A fast toolkit for building and testing Solidity contracts."],
  "forge": ["forge", "Foundry's command-line tool that compiles contracts and runs Solidity tests."],
  "assertion": ["Assertion", "A check in a test, such as assertEq(a, b). If it fails, the test fails."],
  "fuzzing": ["Fuzz testing", "Running a test many times with random inputs to find values that break it."],
  "invariant": ["Invariant", "A rule that must always be true, no matter which functions are called in which order."],
  "poc": ["Proof of concept (PoC)", "A test that reproduces an exploit on a local copy of the contracts to prove a bug is real."],
  "signature": ["Signature", "Cryptographic proof that a private key approved a specific message."],
  "nonce": ["Nonce", "A number used once. Marking it used stops the same signature from being replayed."],
  "ecrecover": ["ecrecover", "A built-in that returns the address that signed a hash. Returns address(0) for invalid input."],
  "proxy": ["Proxy", "A contract that holds storage and forwards every call to a replaceable implementation contract."],
  "implementation": ["Implementation", "The logic contract behind a proxy. Upgrading swaps it for a new one."],
  "initializer": ["Initializer", "A function that sets up a proxy's state, used instead of a constructor. Must run exactly once."],
  "severity": ["Severity", "How serious a finding is, from impact (how bad) and likelihood (how easy)."],
  "false positive": ["False positive", "Something that looks like a vulnerability but cannot actually be exploited."],
  "attack surface": ["Attack surface", "Every input and interaction an attacker can control or influence."]
};

window.SL_LEVELS = [
  {
    n: 1, id: "foundations", title: "Solidity Foundations", skill: "code",
    summary: "Read contract code with confidence: structure, data, and the checks that guard it.",
    lessons: [
      { id: "what-is-a-contract", title: "What a smart contract is",
        summary: "A program on the blockchain that holds state and can hold money.",
        concept: `A {{smart contract}} is a program deployed to a blockchain. It keeps data in {{state variable|state variables}} and exposes {{function|functions}} that anyone can call by sending a {{transaction}}.`,
        flow: ["User wallet", "→ sends a transaction", "Contract function runs", "→ reads and writes", "State variables, stored on-chain"],
        caption: "Every action goes through a function. Every lasting change lands in state.",
        file: "Counter.sol",
        code: `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Counter {
  uint256 public count;   // state variable

  function increment() external {
    count += 1;
  }
}`,
        hot: 8, note: "This line changes on-chain state. increment() has no restriction, so any account can change count.",
        why: "Contracts are public and permanent. Any function you can see, an attacker can call with any inputs they choose. Security review starts with one question: who can change which state?",
        q: "In Counter, who can call increment()?",
        a: ["Only the deployer", "Any account or contract", "Only other contracts", "Nobody after deployment"], c: 1,
        fb: "An external function with no access check can be called by any account or contract." },

      { id: "visibility", title: "Visibility: public, private, external, internal",
        summary: "Who can call a function, and what private really means.",
        concept: `{{visibility|Visibility}} controls who can call a function. {{public}} and {{external}} functions are entry points from outside. {{internal}} and {{private}} functions can only be called from inside the contract.`,
        flow: ["Outside caller", "→ can call directly", "external and public functions", "→ which may call", "internal and private helpers"],
        caption: "Internal helpers are still reachable through any public function that calls them.",
        file: "Vault.sol",
        code: `
contract Vault {
  uint256 private secret = 42;

  function withdrawAll() public {
    _send(msg.sender);
  }

  function _send(address to) internal {
    // sends funds to "to"
  }
}`,
        hot: 4, note: "withdrawAll() is public, so it is an entry point. The internal helper _send() is reachable through it.",
        why: "Two common traps: private data is not secret, because all storage can be read from the chain. And an internal function is exposed through every public function that calls it. Always map entry points first.",
        q: "A variable is marked private. Can an outsider read its value?",
        a: ["No, private hides it", "Yes, all on-chain storage can be read", "Only the owner can read it", "Only with the contract's private key"], c: 1,
        fb: "private only stops other contracts from reading the variable in code. Anyone can read raw storage from a node." },

      { id: "data-types", title: "Mappings, structs, and arrays",
        summary: "How contracts organize data, and where it can go wrong.",
        concept: `A {{mapping}} is a lookup table, such as address → balance. A {{struct}} groups related fields. An {{array}} is an ordered list that can grow.`,
        flow: ["balances[alice]", "→ mapping lookup", "Returns her balance", "→ for an address never used", "Returns 0, never an error"],
        caption: "Every mapping key exists and starts at zero.",
        file: "Orders.sol",
        code: `
struct Order {
  address buyer;
  uint256 amount;
}

mapping(address => uint256) public balances;
Order[] public orders;

function refundAll() external {
  for (uint256 i = 0; i < orders.length; i++) {
    // pay orders[i].buyer
  }
}`,
        hot: 10, note: "This loop runs once per order. If anyone can add orders, the loop can grow until it needs more gas than a block allows.",
        why: "Mappings return 0 for missing keys, which can hide logic errors. Arrays that anyone can grow make loops unbounded, which can freeze a function permanently.",
        q: "What does balances[addr] return for an address that never deposited?",
        a: ["It reverts", "0", "A random value", "The caller's balance"], c: 1,
        fb: "Every mapping key exists and starts at its default value, which is 0 for uint256." },

      { id: "events-modifiers", title: "Events and modifiers",
        summary: "Logs for the outside world and reusable checks for functions.",
        concept: `An {{event}} writes a log that off-chain tools can read. A {{modifier}} wraps a function with a reusable check, such as "only the owner may call this".`,
        flow: ["Caller", "→ calls setFee()", "onlyOwner checks msg.sender", "→ check passes", "+Function body runs", "→ then", "FeeChanged event is logged"],
        caption: "The modifier runs first. The function body runs where the _ appears.",
        file: "Fees.sol",
        code: `
address public owner;
event FeeChanged(uint256 newFee);

modifier onlyOwner() {
  require(msg.sender == owner, "not owner");
  _;
}

function setFee(uint256 fee) external onlyOwner {
  feeBps = fee;
  emit FeeChanged(fee);
}`,
        hot: 5, note: "The entire protection lives on this line. The _ on the next line is where the function body runs, only after the check passes.",
        why: "A modifier only protects functions that actually use it, and only as well as its check is written. Auditors confirm that every sensitive function carries the right modifier.",
        q: "What does the _ inside a modifier mean?",
        a: ["End the function", "Run the wrapped function's body here", "Skip the check", "Emit an event"], c: 1,
        fb: "The _ marks where the function body is inserted. Code before it runs first." },

      { id: "require-msg", title: "require, revert, msg.sender, msg.value",
        summary: "The building blocks of almost every security check.",
        concept: `{{msg.sender}} is the address calling right now. {{msg.value}} is the ether sent with the call. {{require}} stops and undoes everything if a condition is false. {{revert}} does the same without a condition.`,
        flow: ["Call arrives with msg.sender and msg.value", "→ require(condition)", "+True: execution continues", "→ otherwise", "!False: revert, all changes undone"],
        caption: "A revert undoes every state change made in the call.",
        file: "Shop.sol",
        code: `
function buy(uint256 qty) external payable {
  require(qty > 0, "zero qty");
  require(msg.value == qty * PRICE, "wrong payment");
  if (sold + qty > MAX) revert("sold out");
  sold += qty;
  owned[msg.sender] += qty;
}`,
        hot: 3, note: "The payment check. If it were missing or wrong, buyers could take items without paying the full price.",
        why: "Most access and payment bugs come down to a missing or incorrect check. Read every require and ask: what happens if this were missing or could be bypassed?",
        q: "A require fails halfway through a function. What happens to state changes made earlier in that call?",
        a: ["They stay", "They are undone", "Only ether transfers stay", "They are saved as pending"], c: 1,
        fb: "A failed require reverts the call, undoing every state change made in it." }
    ]
  },

  {
    n: 2, id: "evm", title: "EVM and Transactions", skill: "code",
    summary: "How code actually executes on-chain, what it costs, and who controls ordering.",
    lessons: [
      { id: "evm-gas", title: "The EVM, transactions, and gas",
        summary: "How a transaction becomes executed code, and why cost matters.",
        concept: `The {{evm|EVM}} is the computer that runs every contract, the same way on every node. A {{transaction}} is a signed request to run something. {{gas}} pays for each step of execution.`,
        flow: ["Signed transaction", "→ broadcast", "Waits in the mempool", "→ included in a block", "EVM executes it step by step", "→ every step costs", "Gas, paid by the sender"],
        caption: "If gas runs out, the whole call reverts, but the gas is still spent.",
        file: "Sum.sol",
        code: `
function sumAll(uint256[] calldata xs) external pure returns (uint256 total) {
  for (uint256 i = 0; i < xs.length; i++) {
    total += xs[i];
  }
}`,
        hot: 2, note: "Each loop iteration costs gas. A large enough input runs out of gas and the whole call reverts.",
        why: "Every block has a gas limit. Code whose cost grows without limit can become impossible to run, and attackers can trigger that on purpose.",
        q: "A transaction runs out of gas halfway through. What happens?",
        a: ["Half of the changes are kept", "All changes revert, but the gas is still spent", "Nothing is charged", "The EVM retries it later"], c: 1,
        fb: "Out-of-gas reverts every change, and the sender still pays for the gas consumed." },

      { id: "data-locations", title: "Storage, memory, and calldata",
        summary: "Where data lives, and the silent bugs from mixing them up.",
        concept: `{{storage}} is permanent contract data. {{memory}} is temporary scratch space for one call. {{calldata}} is the read-only input sent with the call.`,
        flow: ["calldata: read-only input", "→ copied into", "memory: gone after the call", "→ written to", "storage: permanent on-chain state"],
        caption: "Changing a memory copy never changes storage.",
        file: "Users.sol",
        code: `
struct User { uint256 balance; }
mapping(address => User) users;

function reset() external {
  User memory u = users[msg.sender];
  u.balance = 0;   // changes a copy only
}`,
        hot: 6, note: "u is a memory copy. Setting its balance to 0 does not change storage. The stored balance is untouched.",
        why: "Mixing up memory and storage creates silent accounting bugs: the code looks like it updates a balance, but nothing is saved.",
        q: "To actually change the stored balance, line 5 should declare u as…",
        a: ["User memory u", "User storage u", "User calldata u", "uint256 u"], c: 1,
        fb: "A storage reference points at the real stored struct, so writes through it persist." },

      { id: "addresses-deploy", title: "Addresses and deployment",
        summary: "Accounts, contracts, and who ends up in control.",
        concept: `An {{address}} identifies an account. Wallets controlled by a private key are {{eoa|EOAs}}. Contracts also have addresses. Deploying runs the {{constructor}} exactly once to set up initial state.`,
        flow: ["Deployer sends a creation transaction", "→ EVM runs", "constructor(), only once", "→ stores", "Contract code at a new address"],
        caption: "Whoever is msg.sender in the constructor often becomes the owner.",
        file: "Treasury.sol",
        code: `
contract Treasury {
  address public owner;

  constructor() {
    owner = msg.sender;
  }
}`,
        hot: 5, note: "The deployer becomes owner. If a factory contract deploys Treasury, msg.sender is the factory, not the person.",
        why: "Who is msg.sender at deployment decides who controls the contract. Getting it wrong can lock control in the wrong address permanently.",
        q: "Treasury is deployed by a factory contract. Who is owner?",
        a: ["The person who called the factory", "The factory contract", "address(0)", "The block producer"], c: 1,
        fb: "msg.sender is the immediate caller. When a factory deploys, the factory is msg.sender." },

      { id: "external-calls", title: "External calls hand over control",
        summary: "The moment another contract's code runs inside your function.",
        concept: `An {{external call}} runs code in another contract. While it runs, that code can do anything, including calling back into your contract before your function has finished.`,
        flow: ["Your contract", "→ call{value: x}()", "Receiver's code runs", "→ it can call back", "!Your contract again, mid-function"],
        caption: "Every external call is a point where someone else's code runs.",
        file: "Payout.sol",
        code: `
function payout(address to, uint256 amount) internal {
  (bool ok, ) = to.call{value: amount}("");
  require(ok, "send failed");
}`,
        hot: 2, note: "Sending ether with call runs the receiver's receive() or fallback() function, with almost all remaining gas.",
        why: "Any state that is not yet updated when control is handed over can be abused by the callee. This is the root of reentrancy.",
        q: "When to.call{value: amount}(\"\") sends ether to a contract, what runs?",
        a: ["Nothing", "The receiver's receive() or fallback() function", "Only the balance transfer", "The sender's constructor"], c: 1,
        fb: "Sending ether to a contract executes its receive() or fallback() function." },

      { id: "tx-ordering", title: "Transaction ordering",
        summary: "Pending transactions are public, and order can be bought.",
        concept: `Pending transactions sit in the public {{mempool}}. Block builders choose the order. Anyone who sees a profitable pending transaction can try to get ahead of it. That is {{front-running}}.`,
        flow: ["You submit the answer to a puzzle", "→ visible while pending", "!Attacker copies it with a higher fee", "→ ordered first", "!Attacker is paid, you are not"],
        caption: "Never assume your transaction runs first or alone.",
        file: "Puzzle.sol",
        code: `
function claimReward(bytes32 answer) external {
  require(keccak256(abi.encode(answer)) == ANSWER_HASH, "wrong");
  payable(msg.sender).transfer(REWARD);
}`,
        hot: 1, note: "The correct answer is sent in plain view as a function argument. Anyone watching the mempool can copy it.",
        why: "Anything profitable and visible in the mempool can be copied, front-run, or sandwiched. Designs need commit-reveal schemes, slippage limits, or deadlines.",
        q: "Why can claimReward be front-run?",
        a: ["The hash function is weak", "The answer is visible in the pending transaction", "transfer is unsafe", "REWARD is public"], c: 1,
        fb: "The answer travels as plain calldata in a public pending transaction, so anyone can resubmit it first.",
        skill: "exploit" }
    ]
  },

  {
    n: 3, id: "recognition", title: "Vulnerability Recognition", skill: "recognition",
    summary: "Recognize the bug classes that cause most real losses.",
    lessons: [
      { id: "reentrancy", title: "Reentrancy",
        summary: "An external call before a state update lets the caller come back in.",
        concept: `{{reentrancy|Reentrancy}} happens when a contract makes an {{external call}} before it finishes updating its own state. The callee calls back in and acts on the stale state.`,
        flow: ["Attacker calls withdraw()", "→ vault sends ether first", "!Attacker's receive() runs", "→ calls withdraw() again", "!Balance not yet zeroed: paid again"],
        caption: "The loop repeats until the vault is empty.",
        file: "SimpleVault.sol",
        code: `
function withdraw() external {
  uint256 amount = balances[msg.sender];
  (bool success, ) = msg.sender.call{value: amount}("");
  require(success, "Transfer failed");
  balances[msg.sender] = 0;
}`,
        hot: 3, note: "Control is handed to the caller while balances[msg.sender] still holds the full amount. It is only zeroed on line 5.",
        why: "An attacker contract re-enters withdraw() from its receive() function and is paid again and again from other users' deposits. Fix with {{cei|checks-effects-interactions}}: zero the balance before the call, and add a reentrancy guard.",
        q: "Which change removes the reentrancy risk in this function?",
        a: ["A longer require message", "Move balances[msg.sender] = 0 above the external call", "Make withdraw() public", "Remove the require"], c: 1,
        fb: "Updating state before the call means a re-entrant call sees a zero balance and gets nothing." },

      { id: "missing-access-control", title: "Missing access control",
        summary: "A sensitive function that anyone can call.",
        concept: `{{access control|Access control}} limits who can call sensitive functions. If a function that changes owners, prices, or where funds go has no check, anyone can call it.`,
        flow: ["Anyone", "→ calls setOwner(attacker)", "!No check on msg.sender", "→ succeeds", "!Attacker controls every admin function"],
        caption: "One unprotected admin function usually means full takeover.",
        file: "Admin.sol",
        code: `
address public owner;

function setOwner(address newOwner) external {
  owner = newOwner;
}

function sweep(address to) external {
  require(msg.sender == owner, "not owner");
  payable(to).transfer(address(this).balance);
}`,
        hot: 3, note: "setOwner() has no restriction. The careful check in sweep() is useless, because anyone can make themselves owner first.",
        why: "Missing access control on one function can defeat every other check. For each state-changing function, ask who should be allowed to call it, and confirm the code enforces that.",
        q: "How would an attacker take the funds?",
        a: ["Call sweep() directly", "Call setOwner(themselves), then sweep()", "Send ether to the contract", "Wait for the owner to call sweep()"], c: 1,
        fb: "setOwner() is unprotected, so the attacker becomes owner and then passes sweep()'s check." },

      { id: "broken-authorization", title: "Broken authorization",
        summary: "A check exists, but it checks the wrong thing.",
        concept: `Broken authorization means a check is present but verifies the wrong thing: a parameter instead of the caller, the wrong variable, or a condition that is always true.`,
        flow: ["Attacker calls transferFrom(victim, attacker, id)", "→ code checks", "Victim really owns the token", "→ but never checks", "!Whether the caller is allowed to move it"],
        caption: "The code looks protected at a glance.",
        file: "NFT.sol",
        code: `
function transferFrom(address from, address to, uint256 id) external {
  require(ownerOf[id] == from, "not owner");
  ownerOf[id] = to;
}`,
        hot: 2, note: "This confirms that from owns the token, but never confirms that msg.sender is from or an approved operator.",
        why: "Anyone can move anyone's token. For every check, ask: does it tie this action to the actual rights of msg.sender?",
        q: "What check is missing?",
        a: ["to != address(0)", "msg.sender is from, or is approved by from", "id < totalSupply", "from != to"], c: 1,
        fb: "Authorization must bind the caller to the owner's permission." },

      { id: "tx-origin", title: "tx.origin misuse",
        summary: "Authorizing the wrong account in a call chain.",
        concept: `{{tx.origin}} is the wallet that started the whole transaction. {{msg.sender}} is the immediate caller. Checking tx.origin lets a malicious contract act with the victim's authority.`,
        flow: ["Owner is tricked into calling an attacker contract", "→ which calls", "Wallet.transfer()", "→ checks tx.origin == owner", "!True, so funds go to the attacker"],
        caption: "tx.origin stays the owner through every contract in the chain.",
        file: "Wallet.sol",
        code: `
function transfer(address payable to, uint256 amount) external {
  require(tx.origin == owner, "not owner");
  to.transfer(amount);
}`,
        hot: 2, note: "tx.origin is the owner even when the call arrives through an attacker's contract.",
        why: "Luring the owner into one harmless-looking call is enough to drain the wallet. Use msg.sender for authorization.",
        q: "Which variable should this check use?",
        a: ["block.coinbase", "msg.sender", "tx.gasprice", "address(this)"], c: 1,
        fb: "msg.sender is the direct caller, so an intermediate attacker contract fails the check." },

      { id: "unchecked-calls", title: "Unchecked external calls",
        summary: "A failed call that the code treats as a success.",
        concept: `Low-level calls such as call and send return false instead of reverting when they fail. If the code ignores that result, it carries on as if the transfer happened.`,
        flow: ["Contract marks the winner as paid", "→ send() fails and returns false", "!Return value ignored", "→", "!Winner recorded as paid but received nothing"],
        caption: "Accounting and reality drift apart.",
        file: "Lottery.sol",
        code: `
function payWinner(address payable winner) external {
  require(!paid, "already paid");
  paid = true;
  winner.send(prize);
}`,
        hot: 4, note: "send() returns false on failure, and this line ignores it. paid is already true, so the prize can never be paid.",
        why: "Ignored failures leave funds stuck or users marked as paid when they were not. Check the result, or record what is owed and let the user withdraw.",
        q: "What should line 4 do?",
        a: ["Nothing, send always works", "Check the boolean result and handle failure", "Use tx.origin", "Move above line 2"], c: 1,
        fb: "The return value is the only signal of failure for send and call." },

      { id: "accounting", title: "Integer and accounting errors",
        summary: "Value moves, but the matching balance update is wrong or missing.",
        concept: `Since Solidity 0.8, arithmetic overflow reverts, except inside unchecked blocks. Most real arithmetic bugs today are accounting mistakes: the wrong balance updated, double counting, or rounding that favors the user.`,
        flow: ["User withdraws 10", "→", "!Only totalDeposits is reduced", "→", "!User's own balance is still 10: withdraw again"],
        caption: "Every value transfer needs a matching debit or credit.",
        file: "Bank.sol",
        code: `
function withdraw(uint256 amount) external {
  require(balances[msg.sender] >= amount, "too much");
  totalDeposits -= amount;
  payable(msg.sender).transfer(amount);
}`,
        hot: 3, note: "The total is reduced, but balances[msg.sender] never is. The check on line 2 keeps passing on every call.",
        why: "Accounting bugs let someone take more than they own. Trace every transfer and confirm the matching balance change happens to the right account.",
        q: "Which line is missing?",
        a: ["balances[msg.sender] -= amount;", "totalDeposits += amount;", "require(amount > 0);", "emit Withdraw(amount);"], c: 0,
        fb: "Without debiting the user's balance, the same funds can be withdrawn repeatedly." },

      { id: "delegatecall", title: "Unsafe delegatecall",
        summary: "Running untrusted code with your contract's storage.",
        concept: `{{delegatecall}} runs another contract's code using your contract's storage and balance. If an attacker chooses the target, they run any code they like as your contract.`,
        flow: ["Attacker calls execute(evil, data)", "→ delegatecall", "!Evil code runs with Wallet's storage", "→ writes storage slot 0", "!Attacker becomes owner"],
        caption: "delegatecall to an untrusted address gives the contract away.",
        file: "Executor.sol",
        code: `
address public owner;

function execute(address target, bytes calldata data) external {
  (bool ok, ) = target.delegatecall(data);
  require(ok);
}`,
        hot: 4, note: "target comes from the caller. Any contract the attacker deploys runs with this contract's storage and ether.",
        why: "The attacker can overwrite owner, change balances, or move all funds. Only delegatecall to fixed, trusted code, behind access control.",
        q: "Why is this more dangerous than a normal call?",
        a: ["It costs more gas", "The target's code can modify this contract's storage", "It cannot send ether", "It is deprecated"], c: 1,
        fb: "delegatecall executes foreign code in your storage context." },

      { id: "denial-of-service", title: "Denial of service",
        summary: "Making a function unusable for everyone.",
        concept: `Denial of service makes a function unusable. Common causes: loops over arrays anyone can grow, and payments that one malicious recipient can force to revert.`,
        flow: ["New highest bid", "→ refund the previous leader", "!Leader is a contract that always reverts", "→", "!Every new bid reverts: auction frozen"],
        caption: "One bad recipient blocks everyone.",
        file: "Auction.sol",
        code: `
function bid() external payable {
  require(msg.value > highestBid, "too low");
  payable(highestBidder).transfer(highestBid);
  highestBidder = msg.sender;
  highestBid = msg.value;
}`,
        hot: 3, note: "If highestBidder is a contract that rejects ether, this transfer reverts, and nobody can ever outbid it.",
        why: "Auctions lock, withdrawals freeze, and funds get stuck. Prefer pull payments: record what each user is owed and let them withdraw it themselves.",
        q: "Which design avoids this problem?",
        a: ["Push refunds in a loop", "Let outbid users withdraw their own refunds", "Use tx.origin", "Raise the gas limit"], c: 1,
        fb: "With pull payments, one failing recipient cannot block anyone else." },

      { id: "oracle-manipulation", title: "Oracle manipulation",
        summary: "Trusting a price that can be moved within one transaction.",
        concept: `An {{oracle}} supplies a price. If a contract reads the current spot price from a single pool, an attacker can move that price within one transaction, often with a {{flash loan}}.`,
        flow: ["Attacker borrows a large amount", "→ makes a huge swap", "!Pool price pushed far up", "→ borrows against inflated collateral", "!Repays the loan, keeps the profit"],
        caption: "All of this happens inside a single transaction.",
        file: "Lender.sol",
        code: `
function collateralValue(address user) public view returns (uint256) {
  (uint112 r0, uint112 r1, ) = pair.getReserves();
  uint256 price = uint256(r1) * 1e18 / r0;
  return deposits[user] * price / 1e18;
}`,
        hot: 2, note: "The price comes from the pool's current reserves, which anyone can change with a large trade in the same transaction.",
        why: "Lending, minting, and liquidation logic that trusts a spot price can be drained in one transaction. Use manipulation-resistant sources and sanity checks.",
        q: "What makes this price easy to manipulate?",
        a: ["It uses 1e18", "It reads the pool's instantaneous reserves", "It is a view function", "uint112 is too small"], c: 1,
        fb: "Instantaneous reserves move with any large trade, including one funded by a flash loan." }
    ]
  },

  {
    n: 4, id: "exploits", title: "Exploit Mechanics", skill: "exploit",
    summary: "Dissect each vulnerability: cause, preconditions, path, impact, severity, fix, and test.",
    lessons: [
      { id: "anatomy", title: "Anatomy of an exploit",
        summary: "The eight parts every real finding must explain.",
        concept: `Recognizing a pattern is only the start. A real finding explains eight things: root cause, attacker preconditions, the vulnerable line, the exploit path, impact, {{severity}}, mitigation, and how to test the fix.`,
        flow: ["Root cause", "→", "Attacker preconditions", "→", "Vulnerable line", "→", "Exploit path", "→", "Impact and severity", "→", "+Mitigation and a test that proves the fix"],
        caption: "Every Field Guide entry follows this structure.",
        file: "SimpleVault.sol",
        code: `
function withdraw() external {
  uint256 amount = balances[msg.sender];
  (bool success, ) = msg.sender.call{value: amount}("");
  require(success, "Transfer failed");
  balances[msg.sender] = 0;
}`,
        hot: 3, note: "Every finding points to an exact line. Here: the external call made before the balance update.",
        why: "A claim without preconditions and an exploit path is a guess. Writing all eight parts forces you to prove the bug is real and reachable.",
        q: "Your bug only works if the attacker is the contract owner. Which part of the finding records that?",
        a: ["Impact", "Attacker preconditions", "Mitigation", "Severity"], c: 1,
        fb: "Preconditions state what the attacker must have or control for the exploit to work. They also lower likelihood, and therefore severity." },

      { id: "dissect-reentrancy", title: "Reentrancy, dissected", guide: "reentrancy",
        summary: "From root cause to a tested fix.",
        concept: `Walk through a full reentrancy exploit: what the attacker needs, the exact call sequence, the impact, and how to prove the fix works.`,
        q: "Which precondition must the attacker meet?",
        a: ["Be the contract owner", "Control a contract that can receive ether, and hold a deposit", "Run a validator", "Know the vault's private key"], c: 1,
        fb: "The attack needs a callback: a contract whose receive() re-enters, plus a balance to withdraw." },

      { id: "dissect-access", title: "Access control, dissected", guide: "missing-access-control",
        summary: "How one unprotected function becomes total loss.",
        concept: `Dissect a missing access control bug: why it exists, what an attacker needs (almost nothing), and how a single negative test proves the fix.`,
        q: "setOwner() is unprotected and the owner can sweep all funds. What is the impact?",
        a: ["Some gas is wasted", "Complete loss of the funds the contract holds", "Events are not emitted", "Transactions get slower"], c: 1,
        fb: "Taking ownership unlocks sweep(), so every asset the contract holds is at risk." },

      { id: "dissect-unchecked", title: "Unchecked calls, dissected", guide: "unchecked-call",
        summary: "Proving a silent failure with a test.",
        concept: `Dissect an unchecked call: the failure that goes unnoticed, the state left behind, and a test that forces the failure on purpose.`,
        q: "How would you test the fix?",
        a: ["Check that an event is emitted", "Pay a recipient that rejects ether, and assert the call reverts or the debt stays recorded", "Deploy to mainnet and watch", "Increase the gas limit"], c: 1,
        fb: "A recipient that reverts forces the failure path, so you can check it is handled.", skill: "testing" },

      { id: "dissect-delegatecall", title: "Unsafe delegatecall, dissected", guide: "unsafe-delegatecall",
        summary: "Why arbitrary delegatecall is the worst case.",
        concept: `Dissect an arbitrary delegatecall: the attacker writes their own contract, and it runs with your storage. Then rate the severity.`,
        q: "Which severity fits an arbitrary delegatecall that anyone can reach?",
        a: ["Informational", "Low", "Critical", "Gas optimization"], c: 2,
        fb: "Anyone can take full control of storage and funds. Maximum impact plus maximum likelihood is Critical." },

      { id: "dissect-oracle", title: "Oracle manipulation, dissected", guide: "oracle-manipulation",
        summary: "A single-transaction price attack, step by step.",
        concept: `Dissect a spot-price oracle attack: borrowed capital, a skewed pool, an inflated valuation, and the repayment, all in one transaction.`,
        q: "What is the first step of the exploit path?",
        a: ["Repay the loan", "Borrow a large amount to move the pool price", "Call collateralValue()", "Wait a week"], c: 1,
        fb: "The attacker needs capital to skew the reserves, so the loan comes first." }
    ]
  },

  {
    n: 5, id: "testing", title: "Foundry and Testing", skill: "testing",
    summary: "Turn suspicions into evidence with local tests, fuzzing, and invariants.",
    lessons: [
      { id: "foundry", title: "Foundry and forge",
        summary: "The toolkit auditors use to test Solidity in Solidity.",
        concept: `{{foundry|Foundry}} is a toolkit for Solidity development. Its test runner, {{forge}}, runs tests written in Solidity against a local blockchain on your own computer.`,
        flow: ["Write a test in test/Vault.t.sol", "→ run", "forge test", "→ a local EVM runs each test", "+PASS or FAIL for each one"],
        caption: "Tests run locally. No real network or real funds are involved.",
        file: "test/Counter.t.sol",
        code: `
import {Test} from "forge-std/Test.sol";
import {Counter} from "../src/Counter.sol";

contract CounterTest is Test {
  function test_Increment() public {
    Counter c = new Counter();
    c.increment();
    assertEq(c.count(), 1);
  }
}`,
        hot: 5, note: "forge runs every function whose name starts with test. Each test runs in a fresh, isolated state.",
        why: "Tests turn a suspicion into evidence. A finding backed by a test that reproduces it locally is far stronger than a description.",
        q: "Which command runs Foundry tests?",
        a: ["npm test", "forge test", "solc --test", "cast run"], c: 1,
        fb: "forge test compiles the project and runs every test function." },

      { id: "setup-asserts", title: "Test setup and assertions",
        summary: "Build a scenario, act, then check the result.",
        concept: `setUp() runs before every test to build a fresh scenario. {{assertion|Assertions}} such as assertEq check that results match what you expect.`,
        flow: ["setUp(): deploy the vault, fund users", "→ before each test", "Test body: perform the actions", "→ then", "Assertions check the results"],
        caption: "No assertion, no proof.",
        file: "test/Vault.t.sol",
        code: `
contract VaultTest is Test {
  SimpleVault vault;
  address alice = makeAddr("alice");

  function setUp() public {
    vault = new SimpleVault();
    vm.deal(alice, 5 ether);
  }

  function test_DepositRecordsBalance() public {
    vm.prank(alice);
    vault.deposit{value: 1 ether}();
    assertEq(vault.balances(alice), 1 ether);
  }
}`,
        hot: 13, note: "The assertion is the actual claim. Without it, the test would pass even if the balance were wrong.",
        why: "A test without the right assertion proves nothing. Assert the exact property that would break if the bug were real.",
        q: "What does vm.prank(alice) do?",
        a: ["Gives alice ether", "Makes the next call come from alice", "Deploys alice", "Checks alice's balance"], c: 1,
        fb: "vm.prank sets msg.sender for the next call only." },

      { id: "reverts", title: "Testing reverts",
        summary: "Prove that forbidden actions fail.",
        concept: `Security tests often check that bad actions fail. vm.expectRevert tells forge that the next call must revert, otherwise the test fails.`,
        flow: ["vm.expectRevert(\"not owner\")", "→ the next call", "Attacker calls sweep()", "→", "+It reverts as expected: test passes"],
        caption: "If the attacker's call succeeds, the test fails and flags the bug.",
        file: "test/Access.t.sol",
        code: `
function test_NonOwnerCannotSweep() public {
  address attacker = makeAddr("attacker");
  vm.prank(attacker);
  vm.expectRevert("not owner");
  vault.sweep(attacker);
}`,
        hot: 4, note: "If sweep() does not revert for the attacker, this test fails, which exposes missing access control.",
        why: "Negative tests prove that protections work. Every access-controlled function deserves one.",
        q: "If sweep() succeeds for the attacker, the test…",
        a: ["Passes", "Fails", "Is skipped", "Passes with a warning"], c: 1,
        fb: "expectRevert requires a revert. A successful call fails the test." },

      { id: "fuzzing", title: "Fuzz testing",
        summary: "Let the tool search for the inputs you didn't think of.",
        concept: `A {{fuzzing|fuzz test}} takes inputs as parameters. forge calls it many times with random values, looking for an input that breaks your assertions.`,
        flow: ["Test takes uint96 amount", "→ forge generates", "Hundreds of random amounts", "→ runs each one", "!Any failing input is reported"],
        caption: "Fuzzing finds edge cases such as zero, maximum values, and odd rounding.",
        file: "test/VaultFuzz.t.sol",
        code: `
function testFuzz_WithdrawReturnsDeposit(uint96 amount) public {
  vm.assume(amount > 0);
  vm.deal(alice, amount);
  vm.startPrank(alice);
  vault.deposit{value: amount}();
  vault.withdraw();
  vm.stopPrank();
  assertEq(alice.balance, amount);
}`,
        hot: 2, note: "vm.assume discards inputs you don't care about, here amount == 0.",
        why: "Fuzzing finds the edge cases humans skip. It is cheap, so it should be a habit for every function that handles amounts.",
        q: "What does forge do with a fuzz test's parameters?",
        a: ["Always uses 0", "Fills them with many random values", "Asks you to type them", "Reads them from mainnet"], c: 1,
        fb: "Each run gets new random inputs; a failure is reported with the input that caused it." },

      { id: "invariants", title: "Invariant testing",
        summary: "Rules that must hold after any sequence of calls.",
        concept: `An {{invariant}} is a rule that must always hold, such as "the vault holds at least what users are owed". Invariant tests call random sequences of functions and check the rule after each one.`,
        flow: ["Rule: vault balance ≥ total owed", "→ forge calls random sequences", "deposit, withdraw, deposit…", "→ after each call", "!Rule broken? The sequence is reported"],
        caption: "Invariants catch multi-step bugs that single tests miss.",
        file: "test/Invariant.t.sol",
        code: `
function invariant_VaultIsSolvent() public view {
  assertGe(
    address(vault).balance,
    handler.totalDeposited() - handler.totalWithdrawn()
  );
}`,
        hot: 2, note: "assertGe checks greater than or equal: the vault must always hold at least what users are owed.",
        why: "Invariants describe what must never break, whatever path is taken. They are one of the strongest tools for finding accounting bugs.",
        q: "Which is a good invariant for a token?",
        a: ["transfer emits an event", "totalSupply equals the sum of all balances", "owner is set", "decimals is 18"], c: 1,
        fb: "A conservation rule like supply = sum of balances must hold after any sequence of calls." },

      { id: "local-poc", title: "Local proof-of-concept tests",
        summary: "Reproduce the exploit on your machine, never on a live network.",
        concept: `A {{poc|proof of concept}} is a test that reproduces an exploit against a local copy of the contracts. It runs on your machine or a local fork, never against a live deployment.`,
        flow: ["Deploy locally and add honest deposits", "→", "Deploy the attacker contract", "→ run the attack", "!Assert the vault was drained: bug proven", "→ apply the fix", "+The same attack no longer works"],
        caption: "The PoC measures the impact precisely.",
        file: "test/PoC.t.sol",
        code: `
function test_ReentrancyDrainsVault() public {
  vm.prank(alice);
  vault.deposit{value: 10 ether}();
  Attacker a = new Attacker(vault);
  a.attack{value: 1 ether}();
  assertEq(address(vault).balance, 0);
}`,
        hot: 6, note: "This assertion states the impact exactly: the vault ends with 0 ether. If it passes against vulnerable code, the bug is proven.",
        why: "A local PoC proves a finding is real and measures its impact without touching anyone's funds. Only test on local or forked environments you control.",
        q: "Where should a proof of concept run?",
        a: ["Against the live contract", "On a local chain or a local fork you control", "On a public testnet with real users", "Inside the contract's constructor"], c: 1,
        fb: "Local and forked environments let you prove impact safely and repeatably." }
    ]
  },

  {
    n: 6, id: "advanced", title: "Advanced Security", skill: "exploit",
    summary: "Flash loans, signatures, pricing, precision, upgrades, and cross-contract risk.",
    lessons: [
      { id: "flash-loans", title: "Flash-loan attack mechanics",
        summary: "Unlimited temporary capital for one transaction.",
        concept: `A {{flash loan}} lends any amount with no collateral, as long as it is repaid in the same transaction. It gives anyone huge temporary capital.`,
        flow: ["Borrow 10M tokens", "→", "Use them to move a price, vote, or pass a balance check", "→", "!Exploit the protocol", "→", "Repay the loan plus fee, same transaction"],
        caption: "If repayment fails, the whole transaction reverts, so lenders take no risk.",
        file: "Governor.sol",
        code: `
function propose(bytes calldata action) external {
  require(token.balanceOf(msg.sender) >= THRESHOLD, "too small");
  proposals.push(action);
}`,
        hot: 2, note: "Voting power is read from the current balance. A flash loan can satisfy this check for one transaction.",
        why: "Any check based on a current balance or a spot price can be met with borrowed funds. Use snapshots from earlier blocks.",
        q: "Why doesn't the attacker need their own capital?",
        a: ["Gas is free", "The loan only has to be repaid by the end of the same transaction", "The protocol pays them", "They use tx.origin"], c: 1,
        fb: "Borrowing and repaying in one transaction means only the fee is needed." },

      { id: "signature-replay", title: "Signature replay",
        summary: "One approval, used again and again.",
        concept: `Contracts can accept off-chain {{signature|signatures}} as permission. Without a {{nonce}}, the chain ID, and the contract address in the signed data, the same signature can be reused.`,
        flow: ["Signer approves: pay Bob 1 ETH", "→ Bob submits it", "+Paid once", "→ Bob submits the same signature again", "!Paid again"],
        caption: "Nothing marks the signature as used.",
        file: "Claims.sol",
        code: `
function claim(uint256 amount, bytes calldata sig) external {
  bytes32 h = keccak256(abi.encodePacked(msg.sender, amount));
  require(ECDSA.recover(toEthSigned(h), sig) == signer, "bad sig");
  payable(msg.sender).transfer(amount);
}`,
        hot: 2, note: "The signed message has no nonce, chain ID, or contract address, so it stays valid forever and everywhere.",
        why: "One approval can be spent many times, or on another chain or contract. Use EIP-712 typed data with a nonce that is marked as used.",
        q: "What most directly stops replay?",
        a: ["A longer message", "A nonce that is recorded as used", "Using send instead of transfer", "A larger amount"], c: 1,
        fb: "Once a nonce is consumed, the same signature can never pass again." },

      { id: "signature-validation", title: "Incorrect signature validation",
        summary: "When an invalid signature counts as valid.",
        concept: `{{ecrecover}} returns address(0) for an invalid signature instead of reverting. If the expected signer was never set, it is also address(0), and they match.`,
        flow: ["signer never set: address(0)", "→ attacker sends a garbage signature", "ecrecover returns address(0)", "→ comparison", "!address(0) == signer: accepted"],
        caption: "No private key needed.",
        file: "Mint.sol",
        code: `
address public signer;   // never set

function mintWithSig(uint256 id, uint8 v, bytes32 r, bytes32 s) external {
  address who = ecrecover(keccak256(abi.encode(msg.sender, id)), v, r, s);
  require(who == signer, "bad sig");
  _mint(msg.sender, id);
}`,
        hot: 5, note: "There is no check that who != address(0). With signer unset, any invalid signature passes.",
        why: "Anyone can mint or authorize actions. Reject address(0) and prefer audited libraries such as OpenZeppelin ECDSA, which revert on invalid signatures and reject malleable ones.",
        q: "Which extra check fixes line 5?",
        a: ["require(v == 27)", "require(who != address(0))", "require(id > 0)", "require(msg.value > 0)"], c: 1,
        fb: "Rejecting the zero address closes the invalid-signature path." },

      { id: "price-manipulation", title: "Price manipulation",
        summary: "Prices computed from balances anyone can change.",
        concept: `Prices computed from a contract's own token balance can be manipulated without any oracle, for example by sending tokens directly to the contract.`,
        flow: ["Share price = token balance ÷ total shares", "→ attacker sends tokens directly", "!Balance jumps, share price inflated", "→ next user deposits", "!Their shares round down to 0"],
        caption: "This is the classic vault inflation attack.",
        file: "SharesVault.sol",
        code: `
function deposit(uint256 assets) external returns (uint256 shares) {
  shares = totalShares == 0
    ? assets
    : assets * totalShares / token.balanceOf(address(this));
  totalShares += shares;
  token.transferFrom(msg.sender, address(this), assets);
}`,
        hot: 4, note: "The denominator is the raw token balance, which anyone can increase by sending tokens straight to the contract.",
        why: "The first depositor inflates the share price and steals later deposits through rounding. Track assets internally or use virtual shares and offsets.",
        q: "Which value can the attacker inflate without calling deposit()?",
        a: ["totalShares", "token.balanceOf(address(this))", "assets", "shares"], c: 1,
        fb: "A direct token transfer raises the contract's balance without minting shares." },

      { id: "precision-loss", title: "Precision loss",
        summary: "Integer division rounds down, and attackers can farm it.",
        concept: `Solidity has no decimals. Integer division rounds down. Dividing before multiplying throws precision away, and repeated rounding can be exploited.`,
        flow: ["fee = amount / 10000 * feeBps", "→ amount is 9,999", "!9,999 / 10,000 = 0", "→", "!fee = 0: small trades pay nothing"],
        caption: "Split one big trade into many small ones and the fee disappears.",
        file: "Fees.sol",
        code: `
function fee(uint256 amount) public view returns (uint256) {
  return amount / 10_000 * feeBps;
}`,
        hot: 2, note: "Division happens first, so any amount below 10,000 produces a fee of 0.",
        why: "Rounding leaks value, and attackers split actions into tiny pieces to exploit it. Multiply before dividing, and round in the protocol's favor.",
        q: "Which rewrite keeps precision?",
        a: ["amount / (10_000 * feeBps)", "amount * feeBps / 10_000", "feeBps / 10_000 * amount", "(amount / 10_000) * feeBps + 1"], c: 1,
        fb: "Multiplying first keeps the significant digits before the single division." },

      { id: "upgradeability", title: "Upgradeability risks",
        summary: "New code must read old storage the same way.",
        concept: `A {{proxy}} keeps the storage and forwards calls to an {{implementation}} contract that can be replaced. Every new version must keep the exact same storage layout.`,
        flow: ["Proxy storage: slot 0 owner, slot 1 total", "→ upgrade to V2", "!V2 adds a variable before owner", "→", "!Every slot shifts: data corrupted"],
        caption: "Variable order decides storage slots.",
        file: "Bank.sol",
        code: `
// V1
contract BankV1 { address owner; uint256 total; }

// V2 (broken)
contract BankV2 {
  uint256 fee;      // inserted first
  address owner;
  uint256 total;
}`,
        hot: 6, note: "Inserting fee first moves owner and total to new slots. V2 reads V1's owner as fee.",
        why: "Storage collisions corrupt ownership and balances after an upgrade. Only append new variables, use storage gaps or namespaced storage, and compare layouts with tooling.",
        q: "Where is it safe to add new state variables in an upgrade?",
        a: ["At the start", "At the end of the existing layout", "Anywhere", "In the constructor"], c: 1,
        fb: "Appending keeps every existing variable in its original slot." },

      { id: "initialization", title: "Initialization mistakes",
        summary: "An initializer anyone can call, or call twice.",
        concept: `Proxies cannot use constructors, so they use an {{initializer}} function. If it can be called again, or is left uncalled, anyone can claim ownership.`,
        flow: ["Proxy is deployed", "→", "!initialize() not called in the same transaction", "→ attacker calls initialize()", "!Attacker becomes owner"],
        caption: "The first caller wins.",
        file: "VaultV1.sol",
        code: `
function initialize(address _owner) external {
  owner = _owner;
  feeBps = 30;
}`,
        hot: 1, note: "No run-once guard. Anyone can call it, at any time, as often as they like.",
        why: "Unprotected initializers give away ownership and upgrade rights. Use an initializer guard, initialize at deployment, and disable initializers on the implementation.",
        q: "What protects initialize() from being called twice?",
        a: ["The onlyOwner modifier alone", "An initializer guard that records it has run", "Making it internal", "Checking tx.origin"], c: 1,
        fb: "A run-once guard (such as OpenZeppelin's initializer modifier) blocks any second call." },

      { id: "cross-contract", title: "Cross-contract interactions",
        summary: "Safe on its own, exploitable through a dependency.",
        concept: `Contracts trust each other's state. If your contract reads another protocol's value while that protocol is mid-operation, it can see inconsistent numbers. This is called read-only reentrancy.`,
        flow: ["Pool.removeLiquidity() sends ETH first", "→ attacker's receive() runs", "Pool's state is half-updated", "→ attacker calls Lender.borrow()", "!Lender reads Pool's stale price"],
        caption: "Your code is only as safe as the state it trusts.",
        file: "Lender.sol",
        code: `
// Lender trusts Pool's view function
function borrow(uint256 amount) external {
  uint256 price = pool.getVirtualPrice();
  require(collateral[msg.sender] * price / 1e18 >= amount * 2);
  _send(msg.sender, amount);
}`,
        hot: 3, note: "If this runs while Pool is mid-operation, getVirtualPrice() can return a temporarily wrong value.",
        why: "A contract can be correct in isolation and still be exploited through what it trusts. Map dependencies, and check that the view functions you rely on are protected against reentrancy.",
        q: "Why can reading a view function be dangerous here?",
        a: ["View functions cost gas", "It may return inconsistent state while the other contract is mid-execution", "View functions can change storage", "View functions cannot be called externally"], c: 1,
        fb: "Read-only reentrancy exploits values read during another contract's unfinished operation." }
    ]
  },

  {
    n: 7, id: "auditing", title: "Professional Auditing", skill: "reporting",
    summary: "Review unfamiliar code methodically and report findings professionally.",
    lessons: [
      { id: "first-pass", title: "Inspecting an unfamiliar contract",
        summary: "Start with context, not code.",
        concept: `Before reading code, learn what the protocol does, what it holds, who the actors are, and which files are in scope.`,
        flow: ["Read the docs and README", "→", "List the contracts in scope", "→", "Identify actors: users, admins, keepers", "→", "Note what holds value"],
        caption: "These notes become your threat model.",
        file: "AUDIT_NOTES.md", lang: "text",
        code: `
# Audit notes: Vault.sol
Purpose:     users deposit ETH and earn yield
Holds value: yes, all user deposits
Actors:      user, owner, keeper
Trust:       owner can pause; keeper can harvest
Depends on:  Oracle, Strategy`,
        hot: 3, note: "What the contract holds decides where to look hardest. Value-holding contracts get the deepest review.",
        why: "Skipping context produces false positives and missed bugs. Knowing intended behavior is what lets you spot unintended behavior.",
        q: "What should you establish first in an unfamiliar codebase?",
        a: ["Gas optimizations", "What the system does, what it holds, and who the actors are", "Variable naming style", "Compiler warnings only"], c: 1,
        fb: "Purpose, value, and actors define what an attacker would want and who they could be." },

      { id: "map-functions", title: "Mapping important functions",
        summary: "Your attack-surface table.",
        concept: `List every external and public function, who can call it, and what state or funds it changes. This table is your map of the {{attack surface}}.`,
        flow: ["Find every external or public function", "→", "Mark who can call each one", "→", "Mark what each one changes", "→", "!Prioritize: anyone can call it and it moves funds"],
        caption: "Where permissions and value meet, look first.",
        file: "FUNCTION_MAP.md", lang: "text",
        code: `
function        caller   effect
deposit()       anyone   +balance, takes ETH
withdraw()      anyone   -balance, sends ETH
setStrategy()   owner    changes where funds go
harvest()       keeper   moves funds to strategy
pause()         owner    stops withdrawals`,
        hot: 3, note: "Anyone can call it, and it sends ETH: review this first.",
        why: "A complete map ensures nothing gets skipped and shows exactly where an attacker can interact with value.",
        q: "Which function deserves review first?",
        a: ["pause(), owner only", "withdraw(), anyone, sends ETH", "A view function", "The event definitions"], c: 1,
        fb: "Unrestricted functions that move value carry the highest risk." },

      { id: "money-flows", title: "Tracing money flows",
        summary: "Every exit needs a matching debit.",
        concept: `Follow every path value takes in and out. For each one, confirm that the matching accounting update happens to the right account, in the right order.`,
        flow: ["ETH in: deposit()", "→ credit", "balances[user] increases", "→ later", "withdraw(): debit, then ETH out", "→ check", "!Does every exit have a matching debit, first?"],
        caption: "Most critical bugs are broken flows.",
        file: "Vault.sol",
        code: `
function withdraw(uint256 amt) external {
  require(balances[msg.sender] >= amt);
  balances[msg.sender] -= amt;     // debit
  totalAssets -= amt;              // global accounting
  (bool ok, ) = msg.sender.call{value: amt}("");   // value out
  require(ok);
}`,
        hot: 5, note: "Value leaves here. The debits on lines 3 and 4 happen before it, which is the correct order.",
        why: "Most high-severity bugs are flows where value leaves without a matching debit, or arrives without a matching credit.",
        q: "In a correct withdrawal, the debit should happen…",
        a: ["After the transfer", "Before the external transfer", "Only in an event", "Never"], c: 1,
        fb: "Debiting first follows checks-effects-interactions and blocks re-entry abuse." },

      { id: "attack-surface", title: "Identifying attack surfaces",
        summary: "Everything the attacker controls.",
        concept: `The {{attack surface}} is every input an attacker controls: function arguments, msg.value, callback timing, token behavior, prices, and transaction order.`,
        flow: ["Arguments and msg.value", "→", "Callbacks during external calls", "→", "Prices and other contracts' state", "→", "Transaction ordering"],
        caption: "Attackers choose every value they can.",
        file: "Swap.sol",
        code: `
function swap(address tokenIn, uint256 amountIn, uint256 minOut) external {
  IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
  uint256 out = quote(tokenIn, amountIn);
  require(out >= minOut, "slippage");
  _send(msg.sender, out);
}`,
        hot: 2, note: "tokenIn is attacker-chosen. It could be a malicious token with callbacks, or one that takes a fee on transfer.",
        why: "If you list only the obvious inputs, you miss the bug. Treat every caller-chosen value and every external dependency as hostile.",
        q: "Which of these does the attacker control in swap()?",
        a: ["The contract's bytecode", "tokenIn, amountIn, and minOut", "block.chainid", "The compiler version"], c: 1,
        fb: "Every argument is attacker-chosen, including which token contract gets called." },

      { id: "validate-bug", title: "Validating a suspected bug",
        summary: "Is it actually reachable?",
        concept: `A suspicion becomes a finding only when you confirm it is reachable: realistic preconditions, no other check blocking it, and real impact.`,
        flow: ["Suspicion: call before state update", "→ can an attacker reach it?", "→ is there a reentrancy guard?", "→ do other functions share the state?", "+All confirmed: write a PoC"],
        caption: "Check the whole contract, not just the line.",
        file: "Vault.sol",
        code: `
function withdraw() external nonReentrant {
  uint256 amount = balances[msg.sender];
  (bool ok, ) = msg.sender.call{value: amount}("");
  require(ok);
  balances[msg.sender] = 0;
}`,
        hot: 1, note: "nonReentrant blocks re-entry into guarded functions. The ordering is still poor, but you must check whether any unguarded function uses balances during the call.",
        why: "Reporting unreachable bugs wastes everyone's time and damages credibility. Check guards, callers, and shared state across the whole contract.",
        q: "This withdraw() has nonReentrant. What should you check next?",
        a: ["Nothing, it's safe", "Whether unguarded functions use balances during the call", "The event names", "The license header"], c: 1,
        fb: "Cross-function reentrancy through an unguarded function can still exploit the stale balance." },

      { id: "write-poc", title: "Writing a proof of concept",
        summary: "Arrange, act, assert the exact loss.",
        concept: `A good {{poc|proof of concept}} is minimal: set up honest users, perform only the attacker's steps, and assert the exact impact. Run it locally.`,
        flow: ["Arrange: honest deposits", "→", "Act: only the attacker's steps", "→", "Assert: the exact loss", "→", "+Re-run against the fix: the attack fails"],
        caption: "Reviewers trust findings they can run.",
        file: "test/PoC.t.sol",
        code: `
function test_PoC_ReentrancyDrain() public {
  // Arrange: alice deposits 10 ETH
  _depositAs(alice, 10 ether);
  // Act: attacker runs the exploit with 1 ETH
  vm.prank(attacker);
  exploit.run{value: 1 ether}();
  // Assert: alice's funds are gone
  assertEq(address(vault).balance, 0);
}`,
        hot: 8, note: "The assertion quantifies the impact: the vault, which held alice's 10 ETH, ends at zero.",
        why: "A clear PoC turns 'might be a bug' into an undeniable, measurable result that developers can re-run against their fix.",
        q: "What belongs in the Assert step?",
        a: ["Deploying contracts", "The exact, measurable impact", "The attacker's steps", "A gas report"], c: 1,
        fb: "The assertion is the proof: it states precisely what was lost or broken." },

      { id: "impact-severity", title: "Documenting impact and severity",
        summary: "Impact times likelihood.",
        concept: `{{severity|Severity}} combines impact (how bad) with likelihood (how easy). Loss of funds by anyone is Critical or High. Issues that need a trusted admin to misbehave usually rank lower.`,
        flow: ["Impact: funds lost, frozen, or nothing?", "→ combined with", "Likelihood: anyone, admin only, or rare state?", "→", "Severity: Critical, High, Medium, Low, Info"],
        caption: "Justify both halves explicitly.",
        file: "SEVERITY.md", lang: "text",
        code: `
              Likelihood:  High      Medium    Low
Impact High:               Critical  High      Medium
Impact Medium:             High      Medium    Low
Impact Low:                Medium    Low       Low`,
        hot: 2, note: "High impact plus high likelihood, for example anyone can drain all funds, is Critical.",
        why: "Overstating severity damages trust. Understating it leaves users at risk. State the impact and likelihood that justify your rating.",
        q: "Only the trusted owner can trigger a bug that freezes funds. Compared with the same bug triggerable by anyone, severity is…",
        a: ["Higher", "Lower, because likelihood is lower", "Exactly the same", "Always informational"], c: 1,
        fb: "Requiring a trusted role lowers likelihood, which lowers severity." },

      { id: "write-finding", title: "Writing professional findings",
        summary: "A report a developer can act on without asking questions.",
        concept: `A finding has a clear title, severity, location, description, impact, proof of concept, and recommendation. Write it so a developer can fix the issue without asking you anything.`,
        flow: ["Title: what breaks, and how", "→", "Severity and exact location", "→", "Description and impact", "→", "PoC and recommendation"],
        caption: "Specific, reproducible, actionable.",
        file: "FINDING.md", lang: "text",
        code: `
[H-01] Reentrancy in withdraw() lets an attacker drain the vault
Location: SimpleVault.sol, lines 11-16
Description: withdraw() sends ETH before zeroing the balance.
Impact: Any depositor can steal all ETH held by the vault.
PoC: test/PoC.t.sol, test_ReentrancyDrainsVault
Fix: Zero the balance before the call; add nonReentrant.`,
        hot: 1, note: "The title states the bug, where it is, and the consequence, in one line.",
        why: "Developers act on clear findings. Vague reports get disputed or ignored, and real bugs ship.",
        q: "Which is the best finding title?",
        a: ["Bug in contract", "Reentrancy in withdraw() lets an attacker drain the vault", "Possible issue", "Code quality concerns"], c: 1,
        fb: "It names the bug class, the location, and the consequence." },

      { id: "false-positives", title: "Real bug or false positive?",
        summary: "Report only what survives scrutiny.",
        concept: `A {{false positive}} looks like a bug but cannot be exploited: a guard blocks it, the caller is trusted by design, or the impact is nil. Telling them apart is a core auditor skill.`,
        flow: ["Looks like a known pattern", "→ check guards and modifiers", "→ check who can reach it", "→ check the real impact", "+Report only what survives"],
        caption: "Every claim must survive: can an attacker actually do this?",
        file: "Rescue.sol",
        code: `
function rescue(address token) external onlyOwner {
  IERC20(token).transfer(owner, IERC20(token).balanceOf(address(this)));
}`,
        hot: 2, note: "The transfer result is unchecked, but only the trusted owner can call this, and the owner receives the tokens. At most a low or informational note.",
        why: "Flooding a report with false positives buries the real issues and costs credibility. Calibrated judgment is what clients pay for.",
        q: "Is the unchecked transfer in rescue() a High-severity finding?",
        a: ["Yes, any unchecked transfer is High", "No: owner-only and low impact, at most a Low or informational note", "Yes, because tokens move", "Only if the token has 18 decimals"], c: 1,
        fb: "With a trusted caller and no loss to users, the realistic severity is Low or informational." }
    ]
  }
];
