"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft, PlayCircle, Clock } from "lucide-react";

export default function ProjectXPage() {
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const triggerJobCheck = async () => {
    setIsLoading(true);
    setStatus("Triggering job check...");

    try {
      const response = await fetch('/api/projectx/check-jobs', {
        method: 'POST'
      });

      const data = await response.json();
      setLastResult(data);

      if (data.success) {
        setStatus(`✅ Success! Found ${data.recentJobs} recent jobs, sent ${data.sentJobs} to Telegram`);
      } else {
        setStatus(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setStatus(`❌ Failed to trigger job check: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Portfolio
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">ProjectX - LinkedIn Jobs Monitor</CardTitle>
            <CardDescription>
              Automated job monitoring system that runs daily at 9:00 AM UTC
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Cron Schedule Info */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-semibold text-sm mb-1">Automated Schedule</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    This system runs automatically once per day at <strong>9:00 AM UTC</strong>
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                    <li>Checks 4 LinkedIn RSS feeds for new jobs</li>
                    <li>Filters jobs posted in the last 24 hours</li>
                    <li>Sends detailed job analysis to Telegram group</li>
                    <li>No manual intervention required</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Manual Trigger */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Manual Trigger</h3>
                  <p className="text-xs text-muted-foreground">
                    Test the job checker or run it manually anytime
                  </p>
                </div>
                <Button
                  onClick={triggerJobCheck}
                  disabled={isLoading}
                  className="gap-2"
                >
                  <PlayCircle className="h-4 w-4" />
                  {isLoading ? "Running..." : "Run Now"}
                </Button>
              </div>

              {/* Status Message */}
              {status && (
                <div className={`rounded-md p-3 text-sm ${
                  status.includes('❌')
                    ? "bg-destructive/10 text-destructive border border-destructive/20"
                    : "bg-primary/10 text-primary border border-primary/20"
                }`}>
                  {status}
                </div>
              )}

              {/* Last Result Details */}
              {lastResult && lastResult.success && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                  <h4 className="font-semibold">Last Run Details:</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Total Jobs:</span>
                      <span className="ml-2 font-medium">{lastResult.totalJobs}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Recent Jobs (24h):</span>
                      <span className="ml-2 font-medium">{lastResult.recentJobs}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sent to Telegram:</span>
                      <span className="ml-2 font-medium text-green-600">{lastResult.sentJobs}</span>
                    </div>
                    {lastResult.failedJobs > 0 && (
                      <div>
                        <span className="text-muted-foreground">Failed:</span>
                        <span className="ml-2 font-medium text-red-600">{lastResult.failedJobs}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Configuration Details */}
            <div className="text-xs text-muted-foreground space-y-1 pt-4 border-t">
              <p className="font-semibold mb-2">Configuration:</p>
              <p>📡 RSS Feeds: {4} LinkedIn job feeds</p>
              <p>💬 Telegram Chat ID: -1003451374629</p>
              <p>⏰ Cron Schedule: 0 9 * * * (Daily at 9:00 AM UTC)</p>
              <p>🌍 Deployment: Vercel (runs in background)</p>
            </div>

            {/* Important Note */}
            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4">
              <h4 className="font-semibold text-sm mb-1 text-yellow-900 dark:text-yellow-100">
                ⚡ Background Process
              </h4>
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                This job monitor runs automatically on Vercel's servers. You don't need to keep this page open.
                The cron job will execute daily at 9:00 AM UTC regardless of whether you're visiting the site.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
