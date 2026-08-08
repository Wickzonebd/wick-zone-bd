import type { Language } from "@/lib/types";

export type LegalPageKind = "about" | "privacy" | "terms";

export const legalContentDefaults: Record<LegalPageKind, Record<Language, string>> = {
  about: {
    en: `A simple place for digital services, products and opportunities
This platform brings social-media services, reselling products, micro jobs and community features together in one account. Our goal is to keep every service easy to discover, clearly priced and simple to manage from mobile or desktop.

What you can do here
Browse products from the Reselling store, explore available social-media packages, take part in eligible micro jobs, follow your wallet activity and use the community features available to your account.

How the catalog works
Products, service packages, prices, stock and promotional content are managed from the administrator panel. Availability can change, so the information shown on the relevant product or service page is the current information for that listing.

Support and delivery
Where a purchase requires manual delivery or follow-up, the customer can contact the support channel shown on the website. When a payment gateway is enabled, payment instructions and the provider checkout flow will be shown before a transaction is created.

Our approach
We aim for clear information, practical support and a straightforward customer experience. If something on a listing is unclear, please contact support before placing an order.`,
    bn: `ডিজিটাল সেবা, প্রোডাক্ট ও সুযোগ—এক জায়গায়
এই প্ল্যাটফর্মে সোশ্যাল মিডিয়া সার্ভিস, রিসেলিং প্রোডাক্ট, মাইক্রো জব এবং কমিউনিটি ফিচার একটি অ্যাকাউন্টের মধ্যে সাজানো হয়েছে। আমাদের লক্ষ্য হলো মোবাইল বা কম্পিউটার—দুই জায়গা থেকেই প্রয়োজনীয় সেবা সহজে খুঁজে পাওয়া, পরিষ্কার দাম দেখা এবং সহজভাবে ব্যবহার করা।

এখানে কী করতে পারবেন
রিসেলিং স্টোরের প্রোডাক্ট দেখতে পারবেন, উপলভ্য সোশ্যাল মিডিয়া প্যাকেজ বেছে নিতে পারবেন, যোগ্য হলে মাইক্রো জবে অংশ নিতে পারবেন, ওয়ালেটের কার্যক্রম দেখতে পারবেন এবং আপনার অ্যাকাউন্টে চালু থাকা কমিউনিটি ফিচার ব্যবহার করতে পারবেন।

ক্যাটালগ কীভাবে পরিচালিত হয়
প্রোডাক্ট, সার্ভিস প্যাকেজ, দাম, স্টক এবং প্রচারণামূলক কনটেন্ট অ্যাডমিন প্যানেল থেকে পরিচালিত হয়। সময়ের সাথে কোনো পণ্যের দাম বা প্রাপ্যতা পরিবর্তিত হতে পারে; তাই সংশ্লিষ্ট পেজে যে তথ্য দেখানো হচ্ছে সেটিই সেই সময়ের বর্তমান তথ্য হিসেবে বিবেচিত হবে।

সাপোর্ট ও ডেলিভারি
যে অর্ডারে ম্যানুয়াল ডেলিভারি বা পরবর্তী যোগাযোগ প্রয়োজন হবে, সেখানে ওয়েবসাইটে দেওয়া সাপোর্ট মাধ্যম ব্যবহার করা যাবে। পেমেন্ট গেটওয়ে চালু হলে কোনো লেনদেন তৈরির আগে প্রয়োজনীয় পেমেন্ট নির্দেশনা ও গেটওয়ে চেকআউট দেখানো হবে।

আমাদের লক্ষ্য
পরিষ্কার তথ্য, ব্যবহারযোগ্য সাপোর্ট এবং ঝামেলাহীন গ্রাহক অভিজ্ঞতা তৈরি করা। কোনো প্রোডাক্ট বা সার্ভিস সম্পর্কে তথ্য পরিষ্কার না হলে অর্ডার দেওয়ার আগে সাপোর্টে যোগাযোগ করুন।`,
  },
  privacy: {
    en: `Information we handle
To operate an account we may process details such as your name, email address, mobile number, profile information and the content or proof you choose to submit. Authentication credentials are handled through the platform's authentication system rather than being displayed to other users.

How information is used
Information is used to provide account features, show relevant records, process eligible job submissions, maintain wallet or order-related records, provide support, prevent abuse and keep the service functioning securely.

Uploads and public content
Profile images, posts or other content you intentionally publish may be visible to other users according to the feature you use. Proof, administrative records and other restricted information are handled according to the access controls configured for those features.

Payments and external services
If a payment provider or an external destination is enabled, that provider may process information needed to complete the action. Their own privacy terms may also apply. The platform should never ask you to share a password with another user.

Security and retention
We use reasonable technical access controls and keep information for as long as it is needed to operate the service, maintain required records, resolve disputes or meet applicable obligations. No internet service can promise absolute security, so users should protect their login information as well.

Your choices
You may update available profile information from your account. For questions about your information, account records or removal requests, use the support contact shown on the website.`,
    bn: `আমরা যে তথ্য ব্যবহার করি
একটি অ্যাকাউন্ট পরিচালনার জন্য আপনার নাম, ইমেইল, মোবাইল নম্বর, প্রোফাইল তথ্য এবং আপনি স্বেচ্ছায় জমা দেওয়া কনটেন্ট বা প্রুফ প্রক্রিয়াকরণ করা হতে পারে। লগইন-সংক্রান্ত তথ্য প্ল্যাটফর্মের অথেন্টিকেশন ব্যবস্থার মাধ্যমে পরিচালিত হয় এবং অন্য ব্যবহারকারীদের সামনে দেখানো হয় না।

তথ্য কী কাজে ব্যবহার হয়
অ্যাকাউন্টের ফিচার চালানো, প্রয়োজনীয় রেকর্ড দেখানো, যোগ্য মাইক্রো জব সাবমিশন প্রক্রিয়া করা, ওয়ালেট বা অর্ডার-সংক্রান্ত রেকর্ড রাখা, সাপোর্ট দেওয়া, অপব্যবহার প্রতিরোধ করা এবং সিস্টেম নিরাপদ রাখার জন্য তথ্য ব্যবহার করা হয়।

আপলোড ও পাবলিক কনটেন্ট
প্রোফাইল ছবি, পোস্ট বা আপনি নিজে প্রকাশ করা অন্য কনটেন্ট সংশ্লিষ্ট ফিচারের নিয়ম অনুযায়ী অন্য ব্যবহারকারীদের কাছে দৃশ্যমান হতে পারে। প্রুফ, প্রশাসনিক রেকর্ড এবং সীমিত তথ্য সংশ্লিষ্ট ফিচারের অ্যাক্সেস কন্ট্রোল অনুযায়ী পরিচালিত হয়।

পেমেন্ট ও বাহ্যিক সেবা
পেমেন্ট প্রদানকারী বা কোনো বাহ্যিক লিংক চালু থাকলে সেই সেবা কাজটি সম্পন্ন করার জন্য প্রয়োজনীয় তথ্য প্রক্রিয়া করতে পারে এবং তাদের নিজস্ব প্রাইভেসি নীতিও প্রযোজ্য হতে পারে। অন্য কোনো ব্যবহারকারীর কাছে কখনো আপনার পাসওয়ার্ড শেয়ার করবেন না।

নিরাপত্তা ও তথ্য সংরক্ষণ
আমরা যুক্তিসঙ্গত প্রযুক্তিগত অ্যাক্সেস কন্ট্রোল ব্যবহার করি এবং সেবা পরিচালনা, প্রয়োজনীয় রেকর্ড রাখা, বিরোধ নিষ্পত্তি বা প্রযোজ্য দায়িত্ব পালনের জন্য যতদিন প্রয়োজন ততদিন তথ্য রাখা হতে পারে। কোনো অনলাইন সিস্টেম শতভাগ নিরাপত্তার নিশ্চয়তা দিতে পারে না, তাই নিজের লগইন তথ্য সুরক্ষিত রাখাও গুরুত্বপূর্ণ।

আপনার নিয়ন্ত্রণ
অ্যাকাউন্ট থেকে যেসব প্রোফাইল তথ্য পরিবর্তনযোগ্য সেগুলো আপডেট করতে পারবেন। আপনার তথ্য, অ্যাকাউন্ট রেকর্ড বা তথ্য অপসারণের অনুরোধ সম্পর্কে জানতে ওয়েবসাইটে দেখানো সাপোর্ট মাধ্যমে যোগাযোগ করুন।`,
  },
  terms: {
    en: `Using the platform
By using this platform you agree to provide accurate account information, keep your login credentials secure and use the available features lawfully. Do not use another person's account, impersonate others, submit fraudulent proof or attempt to interfere with the service.

Products and services
The price, stock, quantity, description and delivery information shown on a product or service listing apply to that listing at the time you place an order. Please review those details before purchasing. Availability and catalog information may be updated by the administrator.

Payments
No payment is treated as successful merely because a button was clicked. When a payment gateway is enabled, a payment must be confirmed through the configured provider before it can be treated as completed. Provider rules may also apply to the transaction.

Micro jobs and wallet activity
Micro-job rewards are subject to the instructions and review rules shown for the job. False, duplicated or invalid proof may be rejected. Wallet entries and withdrawals are subject to the controls and eligibility conditions shown inside the relevant feature.

Content and conduct
You are responsible for content you submit. Content that is unlawful, deceptive, abusive, invasive of privacy or harmful to the service or other users may be restricted or removed, and an account may be limited where necessary to protect the platform.

Changes and support
Features, prices and these terms may be updated as the service evolves. Material information should be reviewed on the website. If you are unsure about a product, service or rule, contact support before proceeding.`,
    bn: `প্ল্যাটফর্ম ব্যবহারের নিয়ম
এই প্ল্যাটফর্ম ব্যবহার করার মাধ্যমে আপনি সঠিক অ্যাকাউন্ট তথ্য দেওয়া, নিজের লগইন তথ্য নিরাপদ রাখা এবং উপলভ্য ফিচার আইনসম্মতভাবে ব্যবহার করতে সম্মত হন। অন্যের অ্যাকাউন্ট ব্যবহার, অন্যের পরিচয় ধারণ, ভুয়া প্রুফ জমা বা সিস্টেমের স্বাভাবিক কার্যক্রমে বাধা দেওয়ার চেষ্টা করা যাবে না।

প্রোডাক্ট ও সার্ভিস
অর্ডারের সময় কোনো প্রোডাক্ট বা সার্ভিসের পেজে দেখানো দাম, স্টক, পরিমাণ, বর্ণনা ও ডেলিভারি তথ্য সেই লিস্টিংয়ের জন্য প্রযোজ্য হবে। কেনার আগে এসব তথ্য ভালোভাবে দেখে নিন। অ্যাডমিন প্রয়োজন অনুযায়ী প্রাপ্যতা ও ক্যাটালগের তথ্য আপডেট করতে পারবেন।

পেমেন্ট
শুধু কোনো বাটনে ক্লিক করলেই কোনো পেমেন্ট সফল বলে গণ্য হবে না। পেমেন্ট গেটওয়ে চালু হলে নির্ধারিত প্রদানকারীর মাধ্যমে পেমেন্ট নিশ্চিত হওয়ার পরই সেটি সম্পন্ন হিসেবে বিবেচনা করা যাবে। লেনদেনে সংশ্লিষ্ট পেমেন্ট প্রদানকারীর নিয়মও প্রযোজ্য হতে পারে।

মাইক্রো জব ও ওয়ালেট
মাইক্রো জবের রিওয়ার্ড সংশ্লিষ্ট কাজের নির্দেশনা ও রিভিউ নিয়মের ওপর নির্ভর করবে। ভুয়া, ডুপ্লিকেট বা অগ্রহণযোগ্য প্রুফ প্রত্যাখ্যান করা হতে পারে। ওয়ালেট ও উত্তোলনের কার্যক্রম সংশ্লিষ্ট ফিচারে দেখানো যোগ্যতা ও নিয়ন্ত্রণ অনুযায়ী পরিচালিত হবে।

কনটেন্ট ও আচরণ
আপনি যে কনটেন্ট জমা দেন তার দায়িত্ব আপনার। আইনবিরোধী, প্রতারণামূলক, অপমানজনক, গোপনীয়তা লঙ্ঘনকারী অথবা সেবা বা অন্য ব্যবহারকারীর জন্য ক্ষতিকর কনটেন্ট সীমিত বা অপসারণ করা হতে পারে এবং প্রয়োজন হলে অ্যাকাউন্টের ব্যবহার সীমিত করা যেতে পারে।

পরিবর্তন ও সাপোর্ট
সেবা পরিবর্তনের সাথে ফিচার, মূল্য এবং এই শর্তাবলি আপডেট হতে পারে। গুরুত্বপূর্ণ তথ্য ওয়েবসাইটে দেখে নিন। কোনো প্রোডাক্ট, সার্ভিস বা নিয়ম পরিষ্কার না হলে এগিয়ে যাওয়ার আগে সাপোর্টে যোগাযোগ করুন।`,
  },
};
