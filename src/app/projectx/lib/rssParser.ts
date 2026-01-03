import { JobItem } from "../types";
import { RSS_FEED_URLS } from "../config";

export const parseRSSFeed = async (): Promise<JobItem[]> => {
  try {
    const allJobs: JobItem[] = [];
    const seenLinks = new Set<string>();

    // Fetch all RSS feeds in parallel
    const feedPromises = RSS_FEED_URLS.map(async (url) => {
      try {
        const response = await fetch(url);
        const xmlText = await response.text();

        // Use xml2js or similar for Node.js environment
        const parser = typeof DOMParser !== 'undefined'
          ? new DOMParser()
          : null;

        if (!parser) {
          // Server-side parsing
          const items = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];
          const jobs: JobItem[] = items.map(item => {
            const titleMatch = item.match(/<title>(.*?)<\/title>/);
            const linkMatch = item.match(/<link>(.*?)<\/link>/);
            const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
            const descMatch = item.match(/<description>(.*?)<\/description>/s);

            return {
              title: titleMatch ? titleMatch[1] : "",
              link: linkMatch ? linkMatch[1] : "",
              pubDate: pubDateMatch ? pubDateMatch[1] : "",
              description: descMatch ? descMatch[1] : ""
            };
          });
          return jobs;
        } else {
          // Client-side parsing
          const xmlDoc = parser.parseFromString(xmlText, "text/xml");
          const items = xmlDoc.querySelectorAll("item");
          const jobs: JobItem[] = [];

          items.forEach((item) => {
            const title = item.querySelector("title")?.textContent || "";
            const link = item.querySelector("link")?.textContent || "";
            const pubDate = item.querySelector("pubDate")?.textContent || "";
            const description = item.querySelector("description")?.textContent || "";

            jobs.push({ title, link, pubDate, description });
          });

          return jobs;
        }
      } catch (error) {
        console.error(`Error fetching feed ${url}:`, error);
        return [];
      }
    });

    const feedResults = await Promise.all(feedPromises);

    // Merge and deduplicate by link
    feedResults.forEach(jobs => {
      jobs.forEach(job => {
        if (!seenLinks.has(job.link)) {
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
};

export const filterRecentJobs = (jobs: JobItem[], intervalMinutes: number): JobItem[] => {
  const now = new Date();
  const cutoffTime = new Date(now.getTime() - (intervalMinutes + 1) * 60 * 1000);

  return jobs.filter((job) => {
    const jobDate = new Date(job.pubDate);
    return jobDate >= cutoffTime && jobDate <= now;
  });
};
