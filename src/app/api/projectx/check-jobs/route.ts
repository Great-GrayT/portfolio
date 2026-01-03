import { NextResponse } from 'next/server';

const TELEGRAM_BOT_TOKEN = "8506919518:AAHBdqrDXEOwmbZ7RNCuFB6ey7NGQvhjBEI";
const TELEGRAM_CHAT_ID = "-1003451374629";
const RSS_FEED_URLS = [
  "https://rss.app/feeds/w4Ru4NAR9U7AN4DZ.xml",
  "https://rss.app/feeds/lp93S41J4onjcEC8.xml",
  "https://rss.app/feeds/KcrfO8VmpGzIV7hV.xml",
  "https://rss.app/feeds/740W3eyo4bnyhwTs.xml"
];

interface JobItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

interface JobAnalysis {
  certifications: string[];
  yearsExperience: string;
  expertise: string[];
  jobType: string;
  companyType: string;
  keywords: string[];
  academicDegrees: string[];
  majors: string[];
  software: string[];
  programmingSkills: string[];
}

// Parse RSS feeds (server-side with regex)
async function parseRSSFeed(): Promise<JobItem[]> {
  try {
    const allJobs: JobItem[] = [];
    const seenLinks = new Set<string>();

    const feedPromises = RSS_FEED_URLS.map(async (url) => {
      try {
        const response = await fetch(url);
        const xmlText = await response.text();

        // Server-side XML parsing using regex
        const items = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];
        const jobs: JobItem[] = items.map(item => {
          const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
          const linkMatch = item.match(/<link>(.*?)<\/link>/);
          const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
          const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/);

          return {
            title: titleMatch ? (titleMatch[1] || titleMatch[2] || "") : "",
            link: linkMatch ? linkMatch[1] : "",
            pubDate: pubDateMatch ? pubDateMatch[1] : "",
            description: descMatch ? (descMatch[1] || descMatch[2] || "") : ""
          };
        });
        return jobs;
      } catch (error) {
        console.error(`Error fetching feed ${url}:`, error);
        return [];
      }
    });

    const feedResults = await Promise.all(feedPromises);

    // Merge and deduplicate by link
    feedResults.forEach(jobs => {
      jobs.forEach(job => {
        if (!seenLinks.has(job.link) && job.link) {
          seenLinks.add(job.link);
          allJobs.push(job);
        }
      });
    });

    return allJobs;
  } catch (error) {
    console.error("Error parsing RSS feeds:", error);
    throw error;
  }
}

// Filter jobs from last 24 hours (for daily cron)
function filterRecentJobs(jobs: JobItem[]): JobItem[] {
  const now = new Date();
  const cutoffTime = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours to be safe

  return jobs.filter((job) => {
    const jobDate = new Date(job.pubDate);
    return jobDate >= cutoffTime && jobDate <= now;
  });
}

function extractJobDetails(title: string) {
  const cleanTitle = title.replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  const hiringMatch = cleanTitle.match(/(.+?)\s+hiring\s+(.+?)\s+(?:at|in)\s+(.+)/i);

  if (hiringMatch) {
    return {
      company: hiringMatch[1].trim(),
      position: hiringMatch[2].trim(),
      location: hiringMatch[3].trim(),
      fullTitle: cleanTitle
    };
  }

  return {
    company: "N/A",
    position: cleanTitle,
    location: "N/A",
    fullTitle: cleanTitle
  };
}

function analyzeJobDescription(description: string): JobAnalysis {
  const cleanText = description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const lowerText = cleanText.toLowerCase();

  // Extract Certifications
  const certifications: string[] = [];
  const certPatterns = [
    { pattern: /\bCFA\s*(?:Level\s*([I1-3]|One|Two|Three|I{1,3}))?\b/gi, name: 'CFA' },
    { pattern: /\bACCA\b/gi, name: 'ACCA' },
    { pattern: /\bACA\b/gi, name: 'ACA' },
    { pattern: /\bCIMA\b/gi, name: 'CIMA' },
    { pattern: /\bCISI\b/gi, name: 'CISI' },
    { pattern: /\bFRM\b/gi, name: 'FRM' },
    { pattern: /\bCIPFA\b/gi, name: 'CIPFA' },
    { pattern: /\bCA\b/gi, name: 'CA' },
    { pattern: /\bMBA\b/gi, name: 'MBA' },
    { pattern: /\bCPA\b/gi, name: 'CPA' }
  ];

  certPatterns.forEach(({ pattern, name }) => {
    const matches = cleanText.match(pattern);
    if (matches) {
      const uniqueMatches = [...new Set(matches)];
      certifications.push(...uniqueMatches.map(m => m.trim()));
    }
  });

  // Extract Years of Experience
  let yearsExperience = "";
  const expPatterns = [
    /(\d+)\+?\s*(?:to|\-|–)\s*(\d+)\+?\s*years?/i,
    /(\d+)\+?\s*years?/i,
    /minimum\s*(?:of\s*)?(\d+)\s*years?/i,
    /at\s*least\s*(\d+)\s*years?/i
  ];

  for (const pattern of expPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      if (match[2]) {
        yearsExperience = `${match[1]}-${match[2]} years`;
      } else {
        yearsExperience = `${match[1]}+ years`;
      }
      break;
    }
  }

  // Extract Expertise (simplified for brevity - you can expand this)
  const expertise: string[] = [];
  const expertiseKeywords: Record<string, RegExp> = {
    'Financial Modeling': /financial\s*model(?:l?ing)?/gi,
    'DCF Analysis': /\bDCF\b|discounted\s*cash\s*flow/gi,
    'M&A': /\bM&A\b|mergers?\s*(?:and|&)\s*acquisitions?/gi,
    'Portfolio Management': /portfolio\s*manag(?:ement|er)/gi,
    'Risk Management': /risk\s*manag(?:ement|er)/gi,
    'Bloomberg Terminal': /bloomberg(?:\s*terminal)?/gi,
  };

  Object.entries(expertiseKeywords).forEach(([skill, pattern]) => {
    if (pattern.test(cleanText)) {
      expertise.push(skill);
    }
  });

  // Job Type Detection
  let jobType = "General Finance";
  const jobTypes = [
    { type: 'Investment Banking', keywords: ['investment bank', 'IB ', 'M&A', 'mergers'] },
    { type: 'Portfolio Management', keywords: ['portfolio manager', 'portfolio management'] },
    { type: 'Financial Analysis', keywords: ['financial analyst', 'financial analysis'] },
  ];

  for (const { type, keywords } of jobTypes) {
    if (keywords.some(kw => lowerText.includes(kw.toLowerCase()))) {
      jobType = type;
      break;
    }
  }

  // Company Type
  let companyType = "Unknown";
  const companyTypes = [
    { type: 'Investment Bank', keywords: ['goldman sachs', 'morgan stanley', 'jp morgan', 'investment bank'] },
    { type: 'Asset Manager', keywords: ['blackrock', 'vanguard', 'asset manag'] },
  ];

  for (const { type, keywords } of companyTypes) {
    if (keywords.some(kw => lowerText.includes(kw.toLowerCase()))) {
      companyType = type;
      break;
    }
  }

  // Extract Academic Degrees
  const academicDegrees: string[] = [];
  const degreePatterns = [
    { pattern: /\bPh\.?D\.?\b|\bDoctorate\b/gi, name: 'PhD' },
    { pattern: /\bMBA\b/gi, name: 'MBA' },
    { pattern: /\bMaster'?s?\b|\bM\.?S\.?c\.?\b|\bM\.?A\.?\b/gi, name: "Master's" },
    { pattern: /\bBachelor'?s?\b|\bB\.?S\.?c?.?\b|\bB\.?A\.?\b/gi, name: "Bachelor's" },
  ];

  degreePatterns.forEach(({ pattern, name }) => {
    if (pattern.test(cleanText)) {
      academicDegrees.push(name);
    }
  });

  // Extract Keywords
  const stopWords = new Set(['the', 'and', 'for', 'with', 'you', 'will', 'are']);
  const words = lowerText.match(/\b[a-z]{3,}\b/g) || [];
  const wordFreq = words.reduce((acc, word) => {
    if (!stopWords.has(word)) {
      acc[word] = (acc[word] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const keywords = Object.entries(wordFreq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word);

  return {
    certifications: [...new Set(certifications)],
    yearsExperience,
    expertise: [...new Set(expertise)].slice(0, 6),
    jobType,
    companyType,
    keywords,
    academicDegrees: [...new Set(academicDegrees)],
    majors: [],
    software: [],
    programmingSkills: []
  };
}

function formatJobMessage(job: JobItem): string {
  const details = extractJobDetails(job.title);
  const analysis = analyzeJobDescription(job.description);
  const postDate = new Date(job.pubDate);
  const now = new Date();
  const totalMinutes = Math.floor((now.getTime() - postDate.getTime()) / 60000);

  let timeAgo = "";
  if (totalMinutes < 1) {
    timeAgo = "Just now";
  } else if (totalMinutes < 60) {
    timeAgo = `${totalMinutes} min${totalMinutes > 1 ? 's' : ''} ago`;
  } else if (totalMinutes < 1440) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    timeAgo = `${hours}h ${minutes}m ago`;
  } else {
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    timeAgo = `${days}d ${hours}h ago`;
  }

  let message = `🆕 NEW JOB POSTING
━━━━━━━━━━━━━━━━━━━━━━

📋 Position: ${details.position}

🏢 Company: ${details.company}`;

  if (analysis.companyType && analysis.companyType !== "Unknown") {
    message += `\n🏦 Industry: ${analysis.companyType}`;
  }

  message += `\n\n📍 Location: ${details.location}`;

  if (analysis.jobType && analysis.jobType !== "General Finance") {
    message += `\n💼 Role Type: ${analysis.jobType}`;
  }

  if (analysis.yearsExperience) {
    message += `\n📊 Experience: ${analysis.yearsExperience}`;
  }

  if (analysis.certifications.length > 0) {
    message += `\n🎓 Certifications: ${analysis.certifications.join(', ')}`;
  }

  if (analysis.academicDegrees.length > 0) {
    message += `\n🎓 Education: ${analysis.academicDegrees.join(', ')}`;
  }

  if (analysis.expertise.length > 0) {
    message += `\n\n🔧 Key Skills:\n`;
    analysis.expertise.forEach(skill => {
      message += `   • ${skill}\n`;
    });
  }

  if (analysis.keywords.length > 0) {
    message += `\n🔍 Keywords: ${analysis.keywords.slice(0, 10).join(', ')}`;
  }

  message += `\n\n⏰ Posted: ${timeAgo}
📅 ${postDate.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} at ${postDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}

🔗 Apply here:
${job.link}

━━━━━━━━━━━━━━━━━━━━━━
💼 LinkedIn Jobs Monitor`;

  return message;
}

async function sendTelegramMessage(message: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram API error: ${response.status}`);
  }

  return response.json();
}

// Main API handler
export async function GET(request: Request) {
  try {
    console.log('Starting job check...');

    // Fetch all jobs
    const allJobs = await parseRSSFeed();
    console.log(`Fetched ${allJobs.length} total jobs`);

    // Filter recent jobs (last 24 hours)
    const recentJobs = filterRecentJobs(allJobs);
    console.log(`Found ${recentJobs.length} recent jobs`);

    if (recentJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No new jobs found',
        totalJobs: allJobs.length,
        recentJobs: 0,
        sentJobs: 0
      });
    }

    let successCount = 0;
    let failCount = 0;

    // Send messages with progressive delays
    for (let i = 0; i < recentJobs.length; i++) {
      const job = recentJobs[i];

      try {
        const message = formatJobMessage(job);
        await sendTelegramMessage(message);
        successCount++;

        // Progressive delay to prevent rate limiting
        if (i < recentJobs.length - 1) {
          const delay = i < 5 ? 2000 : i < 10 ? 2500 : 3000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        failCount++;
        console.error(`Failed to send job ${i + 1}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${recentJobs.length} jobs`,
      totalJobs: allJobs.length,
      recentJobs: recentJobs.length,
      sentJobs: successCount,
      failedJobs: failCount
    });

  } catch (error) {
    console.error('Error in job check:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers
export async function POST(request: Request) {
  return GET(request);
}
