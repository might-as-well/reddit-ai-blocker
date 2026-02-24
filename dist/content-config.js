"use strict";
var AiBlockerContentConfig;
(function (AiBlockerContentConfig) {
    AiBlockerContentConfig.DEFAULTS = {
        enabled: true,
        threshold: 8,
        customKeywords: [],
        filterSelfPromotion: false,
        llmEnabled: false
    };
    AiBlockerContentConfig.LLM_LOW_DELTA = 3;
    AiBlockerContentConfig.LLM_HIGH_DELTA = 4;
    AiBlockerContentConfig.STRONG_LOCAL_MARGIN = 5;
    AiBlockerContentConfig.DEFAULTS_RECORD = { ...AiBlockerContentConfig.DEFAULTS };
    AiBlockerContentConfig.BASE_PATTERNS = [
        { pattern: /\b(ai tool|ai-powered|ai generated|ai-generated|chatgpt|gpt-?4|llm|prompt engineering)\b/i, weight: 3 },
        { pattern: /\b(\d+-step (marketing|growth|content) framework|marketing framework)\b/i, weight: 4 },
        { pattern: /\b(ai intent intelligence|intent scoring|buying readiness|conversion probability)\b/i, weight: 4 },
        { pattern: /\b(this isn['’]t theory|already live|building in public|feedback welcome)\b/i, weight: 3 },
        { pattern: /\b(founder seats?|one-time:\s*\$?\d|grandfathered|pricing will never be offered again)\b/i, weight: 5 },
        { pattern: /\b(done-for-you|tiers? will range|priority support|roadmap input|custom niche scanning)\b/i, weight: 4 },
        { pattern: /\b(reply or dm|share anonymized real lead examples|real demand signals)\b/i, weight: 4 },
        { pattern: /\b(getting .* mentioned by (chatgpt|claude|llm)|trigger llm mentions?)\b/i, weight: 4 },
        { pattern: /\b(high-authority backlinks?|boost google ranking|drive initial visibility|early users)\b/i, weight: 3 },
        { pattern: /\b(submit(ting)? .* to \d+\+? directories|directories?\b.{0,30}\bsaas|g2|saashub|betalist)\b/i, weight: 3 },
        { pattern: /\b(lessons learned|building in silence|nobody paid|revenue was [€$£]?\s*0)\b/i, weight: 3 },
        { pattern: /\b(for \d+\s*(months?|years?)|after \d+\s*(months?|years?))\b/i, weight: 2 },
        { pattern: /\b(meanwhile we|instead of becoming|everything changed|money is a tool not a guarantee)\b/i, weight: 3 },
        { pattern: /\b(companies with huge raises fail all the time|less envious than i expected)\b/i, weight: 3 },
        { pattern: /\b(honest talk|i['’]m a bit nervous posting this|i['’]ve spent the last few months building)\b/i, weight: 3 },
        { pattern: /\b(it['’]s not just a ['"]?prompt|generic ai tools? that just churn out)\b/i, weight: 4 },
        { pattern: /\b(the deal|how to get in|lifetime pro slots?|worth \$\d+\/mo)\b/i, weight: 4 },
        { pattern: /\b(comment ['"]?(interested|roast it)['"]? below|i['’]ll dm you|vip access code|crash test)\b/i, weight: 4 },
        { pattern: /\b(building in silence|solo developer|no co-?founder|still early|finding my audience)\b/i, weight: 2 },
        { pattern: /\b(from idea to product|launch anxiety|distribution is the real mountain)\b/i, weight: 2 },
        { pattern: /\b(i built|i made|i created)\b.{0,40}\b(tool|product|platform|app|saas)\b/i, weight: 2 },
        { pattern: /\bwould love to hear|would love feedback|open to feedback|what has worked for you\b/i, weight: 2 },
        { pattern: /\b(join (the )?waitlist|get early access|sign up|dm me|link in comments|check it out|drop your link below|what are you building)\b/i, weight: 3 },
        { pattern: /https?:\/\//i, weight: 1 }
    ];
    AiBlockerContentConfig.PROMO_PHRASES = [
        "my startup",
        "my product",
        "my tool",
        "my app",
        "side hustle",
        "small internal tool",
        "launched",
        "just launched",
        "growth",
        "pipeline",
        "visibility",
        "llm mentions",
        "marketing framework",
        "intent intelligence",
        "buying readiness",
        "conversion probability",
        "real demand signals",
        "this isn't theory",
        "already live",
        "founder seats",
        "grandfathered",
        "done-for-you",
        "priority support",
        "roadmap input",
        "reply or dm",
        "ai coach",
        "campaign calendar",
        "target definition",
        "persona development",
        "customer journey",
        "content production",
        "to-do list",
        "high-authority backlinks",
        "boost google ranking",
        "honest talk",
        "a bit nervous posting this",
        "not just a prompt",
        "the deal",
        "how to get in",
        "lifetime pro",
        "worth $99/mo",
        "just comment",
        "i'll dm you",
        "vip access code",
        "drop your link below",
        "what are you building",
        "manual grunt work",
        "professional spreadsheets",
        "real business tool"
    ];
    AiBlockerContentConfig.FIRST_PERSON_MARKERS_REGEX = /\b(i|my|me)\b/g;
    AiBlockerContentConfig.PARALLEL_CADENCE_REGEX = /\bwe\s+[a-z]+(?:ed|ing)?\s+while\s+they\s+[a-z]+(?:ed|ing)?\b/g;
    AiBlockerContentConfig.CONTRAST_CADENCE_REGEX = /\b(instead of|meanwhile|ironically|the difference was|what surprised me most)\b/g;
    AiBlockerContentConfig.BULLET_REGEX = /[•▪◦]\s/g;
    AiBlockerContentConfig.STRUCTURED_TIMELINE_REGEX = /\bweek\s*\d+\s*:/g;
    AiBlockerContentConfig.CADENCE_HOOK_REGEX = /\b(most [a-z\s]+ don['’]t|they lack|outcome:|what this looks like in practice)\b/g;
    AiBlockerContentConfig.STACK_NAMED_REGEX = /\b(python|flask|supabase|firebase|api|backend|pipeline)\b/g;
})(AiBlockerContentConfig || (AiBlockerContentConfig = {}));
