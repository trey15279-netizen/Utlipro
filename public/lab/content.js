// Security Lab lesson content.
// Rules for writing here (they keep the app easy for beginners on a phone):
//   - One idea per step. "text" is at most two short sentences.
//   - Every technical word gets a plain definition in "words".
//   - Prefer a picture or a hands-on lab over more text.
//   - In code and messages, wrap the part to look at in [[double brackets]] to highlight it.
//   - Each quiz has 3 questions. Each question has one right answer and a one-sentence "why".
//   - Brands in examples are made up (Swiftpay, MyBank, ShopMart).
// Icons: key hook lock database bot mail globe wifi phone bank shield alert check keyboard
//        code flag cup leak user eye pencil
"use strict";

window.LAB_LESSONS = [
  {
    id: "passwords",
    icon: "key",
    title: "Strong passwords",
    goal: "Make passwords that are hard to guess.",
    badge: "Password Pro",
    minutes: 3,
    steps: [
      {
        title: "Attackers guess passwords",
        text: "Programs try billions of guesses very fast. Short passwords fall first.",
        words: [["Brute-force attack", "Trying every possible password until one works."]],
        visual: { type: "flow", nodes: [
          { icon: "bot", text: "Guessing program", tone: "bad" },
          { arrow: "tries 123456, password, qwerty…" },
          { icon: "lock", text: "Your account" }
        ] }
      },
      {
        title: "Lab: how fast can it be guessed?",
        text: "Tap each example and watch the meter. Longer wins.",
        note: "Never type a real password here.",
        visual: { type: "lab", lab: "password" }
      },
      {
        title: "Never reuse a password",
        text: "When one site leaks passwords, attackers try them on other sites.",
        words: [["Data breach", "When a company's private data gets stolen."]],
        visual: { type: "flow", nodes: [
          { icon: "leak", text: "A shop website gets hacked", tone: "bad" },
          { arrow: "your password leaks" },
          { icon: "bot", text: "Attacker tries it everywhere", tone: "bad" },
          { arrow: "same password works" },
          { icon: "mail", text: "Your email and bank are open" }
        ] }
      },
      {
        title: "Add a second lock",
        text: "Turn on two-factor login. A stolen password alone is then not enough.",
        words: [["Two-factor authentication (2FA)", "Logging in with your password plus a second proof, like a code on your phone."]],
        visual: { type: "flow", nodes: [
          { icon: "key", text: "1. Type your password" },
          { arrow: "then" },
          { icon: "phone", text: "2. Enter the code from your phone" },
          { arrow: "both correct" },
          { icon: "check", text: "You're in", tone: "good" }
        ] }
      },
      {
        title: "How good sites store passwords",
        text: "Good sites never save your real password. They save a scrambled version.",
        words: [["Hash", "A one-way scramble. Easy to make, nearly impossible to undo."]],
        visual: { type: "code", file: "signup.js", lines: [
          "password = \"sunflower\"",
          "saved    = [[hash(password)]]",
          "",
          "// saved is now \"5e8f1a9c…\"",
          "// the real password is never stored"
        ] }
      }
    ],
    quiz: [
      { q: "Which password is hardest to guess?",
        options: ["Tr0ub!e", "summer2024", "lamp-cactus-ocean-violin", "qwerty123"],
        answer: 2,
        why: "It is the longest. Length matters more than symbols." },
      { q: "A website you use was hacked. What should you do first?",
        options: ["Nothing, it was their fault", "Change that password everywhere you used it", "Delete your email account"],
        answer: 1,
        why: "Attackers will try the leaked password on your other accounts." },
      { q: "What does two-factor authentication add?",
        options: ["A longer password", "A second proof, like a code on your phone", "A faster login"],
        answer: 1,
        why: "Even with your password, an attacker still needs your phone." }
    ]
  },

  {
    id: "phishing",
    icon: "hook",
    title: "Spot phishing",
    goal: "Recognize fake messages before you tap.",
    badge: "Scam Spotter",
    minutes: 3,
    steps: [
      {
        title: "What is phishing?",
        text: "A fake message that tries to trick you. It usually wants your password or money.",
        words: [["Phishing", "A fake email or text pretending to be a company you trust."]],
        visual: { type: "flow", nodes: [
          { icon: "mail", text: "Fake email arrives", tone: "bad" },
          { arrow: "you tap the link" },
          { icon: "globe", text: "Fake login page", tone: "bad" },
          { arrow: "you type your password" },
          { icon: "eye", text: "The attacker has it", tone: "bad" }
        ] }
      },
      {
        title: "Lab: find the red flags",
        text: "This email is fake. Tap the 4 parts that give it away.",
        visual: { type: "lab", lab: "flags", email: {
          name: "Swiftpay Support",
          parts: [
            { id: "from", label: "From", text: "support@[[swiftpa1]]-help.com", flag: true,
              why: "\"swiftpa1\" uses the number 1, not the letter l. Real mail comes from swiftpay.com." },
            { id: "subject", label: "Subject", text: "Your account is locked", flag: false },
            { id: "hello", text: "Dear Customer,", flag: true,
              why: "Real companies usually greet you by your name." },
            { id: "body", text: "We noticed unusual activity on your account.", flag: false },
            { id: "rush", text: "Verify within 1 hour or your account will be deleted.", flag: true,
              why: "Pressure to hurry is a classic trick. It stops you from thinking." },
            { id: "link", button: "Verify now", url: "swiftpay.[[verify-login.co]]/account", flag: true,
              why: "The button opens verify-login.co, not swiftpay.com." }
          ]
        } }
      },
      {
        title: "Check where a link really goes",
        text: "On iPhone, press and hold a link to preview it. Read the end of the site name.",
        words: [["Domain", "A website's name, like mybank.com. Its last part shows who owns it."]],
        visual: { type: "compare",
          bad: { label: "The link says", value: "mybank.com/help", note: "Looks fine…", tone: "neutral" },
          good: { label: "It really opens", value: "mybank.com.[[login-check.xyz]]", note: "login-check.xyz owns it. Not MyBank.", tone: "bad" } }
      },
      {
        title: "What to do instead",
        text: "Don't tap the link. Open the real app or type the website yourself.",
        visual: { type: "flow", nodes: [
          { icon: "alert", text: "A message looks odd" },
          { arrow: "don't tap the link" },
          { icon: "phone", text: "Open the real app yourself", tone: "good" },
          { arrow: "then" },
          { icon: "flag", text: "Report or delete the message", tone: "good" }
        ] }
      }
    ],
    quiz: [
      { q: "An email from \"help@sh0pmart-support.net\" asks you to log in. What's the clue?",
        options: ["The subject line", "The sender's address is fake", "It was sent at night"],
        answer: 1,
        why: "\"sh0pmart\" uses a zero, and the real shop wouldn't use that address." },
      { q: "A text says \"Pay now or you'll be arrested today.\" This is a sign of…",
        options: ["Pressure to hurry", "A real warning", "A software update"],
        answer: 0,
        why: "Scammers create panic so you act without thinking." },
      { q: "What's the safest way to check your account after a strange email?",
        options: ["Tap the link in the email", "Reply and ask if it's real", "Open the company's app yourself"],
        answer: 2,
        why: "Going there yourself skips any fake link." }
    ]
  },

  {
    id: "https",
    icon: "lock",
    title: "HTTPS and the padlock",
    goal: "Know what the padlock does, and what it doesn't.",
    badge: "Connection Guard",
    minutes: 3,
    steps: [
      {
        title: "Your data takes a trip",
        text: "Data passes through many machines on its way. Anyone along the path might read it.",
        visual: { type: "flow", nodes: [
          { icon: "phone", text: "Your phone" },
          { arrow: "travels through" },
          { icon: "wifi", text: "Café Wi-Fi" },
          { arrow: "then" },
          { icon: "globe", text: "The internet" },
          { arrow: "finally" },
          { icon: "bank", text: "Your bank's website" }
        ] }
      },
      {
        title: "Lab: what can a snoop see?",
        text: "Switch between http and https. Watch what someone on the Wi-Fi can read.",
        words: [["Encryption", "Scrambling data so only the right person can unscramble it."],
                ["HTTPS", "The private way to load a website. The \"S\" means secure."]],
        visual: { type: "lab", lab: "https" }
      },
      {
        title: "The padlock means private, not honest",
        text: "Fake sites can have a padlock too. Always check the site name as well.",
        visual: { type: "compare",
          bad: { label: "The padlock tells you", value: "Nobody can read this connection", note: "True.", tone: "good" },
          good: { label: "It does NOT tell you", value: "This is the real company", note: "Check the name yourself.", tone: "bad" } }
      },
      {
        title: "Public Wi-Fi tip",
        text: "On café or airport Wi-Fi, only log in to sites that show https.",
        visual: { type: "flow", nodes: [
          { icon: "cup", text: "You join café Wi-Fi" },
          { arrow: "check the address bar" },
          { icon: "lock", text: "https:// → OK to log in", tone: "good" }
        ] }
      }
    ],
    quiz: [
      { q: "What does HTTPS protect?",
        options: ["Your data while it travels", "Your phone from viruses", "You from fake websites"],
        answer: 0,
        why: "HTTPS scrambles data on its way between you and the site." },
      { q: "A site has a padlock. Does that prove it's the real bank?",
        options: ["Yes, always", "No, check the site name too"],
        answer: 1,
        why: "Scam sites can get a padlock too." },
      { q: "You're on airport Wi-Fi. When is it OK to log in?",
        options: ["On any site", "Only on sites with https://", "Never on a phone"],
        answer: 1,
        why: "HTTPS keeps others on the same Wi-Fi from reading your data." }
    ]
  },

  {
    id: "sql-injection",
    icon: "database",
    title: "SQL injection",
    goal: "See how typed text can hijack a website's code.",
    badge: "Code Defender",
    minutes: 4,
    steps: [
      {
        title: "Websites ask databases questions",
        text: "When you log in, the website asks its database a question about you.",
        words: [["Database", "Where a website keeps its information, like a giant spreadsheet."],
                ["SQL", "The language websites use to ask databases questions."]],
        visual: { type: "flow", nodes: [
          { icon: "pencil", text: "You type your name" },
          { arrow: "sent to" },
          { icon: "code", text: "Website code builds a question" },
          { arrow: "asks" },
          { icon: "database", text: "The database answers" }
        ] }
      },
      {
        title: "The risky way to build the question",
        text: "Some code glues your typing straight into the question. The highlight is what you typed.",
        visual: { type: "code", file: "login.js", lines: [
          "query = \"SELECT * FROM users",
          "         WHERE name = '\" + [[name]] + \"'\""
        ] }
      },
      {
        title: "Lab: hijack the question",
        text: "Tap each example. Watch how the question changes.",
        words: [["Injection", "Sneaking your own code into a program through a text box."]],
        visual: { type: "lab", lab: "sql" }
      },
      {
        title: "The fix: keep data separate",
        text: "The ? is a placeholder. The database treats your typing as plain text, never as code.",
        words: [["Parameterized query", "A question with blanks (?) that get filled in safely."]],
        visual: { type: "code", file: "login.js", lines: [
          "query = \"SELECT * FROM users WHERE name = [[?]]\"",
          "db.run(query, [name])"
        ] }
      },
      {
        title: "The big rule",
        text: "Never trust what users type. Always keep it separate from code.",
        visual: { type: "flow", nodes: [
          { icon: "keyboard", text: "Someone types anything" },
          { arrow: "goes into a ? placeholder" },
          { icon: "shield", text: "Treated as plain text", tone: "good" },
          { arrow: "result" },
          { icon: "check", text: "The question can't be changed", tone: "good" }
        ] }
      }
    ],
    quiz: [
      { q: "What is SQL injection?",
        options: ["A virus on your phone", "Typed text that changes a website's database question", "A strong password"],
        answer: 1,
        why: "The attacker's typing becomes part of the code." },
      { q: "Why does ' OR '1'='1 work on risky code?",
        options: ["It makes the question always true", "It deletes the website", "It guesses the password"],
        answer: 0,
        why: "'1'='1' is always true, so every user matches." },
      { q: "What's the fix?",
        options: ["Hide the login form", "Use placeholders (?) to keep user text separate", "Ask people to type carefully"],
        answer: 1,
        why: "Placeholders make the database treat input as plain data." }
    ]
  }
];
