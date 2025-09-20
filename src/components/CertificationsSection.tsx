"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { certifications } from "@/lib/data";
import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import {
  Award,
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  Building,
  Target,
} from "lucide-react";

// Define proper types
interface Certification {
  id: string;
  name: string;
  issuer: string;
  status: "completed" | "in-progress" | "scheduled";
  issueDate?: string;
  scheduledDate?: string;
  credentialId?: string;
}

export default function CertificationsSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [logoErrors, setLogoErrors] = useState<Set<string>>(new Set());

  const handleLogoError = (logoId: string) => {
    console.log(`Logo failed for: ${logoId}`);
    setLogoErrors((prev: Set<string>) => new Set([...prev, logoId]));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return CheckCircle;
      case "in-progress":
        return Clock;
      case "scheduled":
        return Target;
      default:
        return Award;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-600";
      case "in-progress":
        return "text-blue-600";
      case "scheduled":
        return "text-orange-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusBadgeVariant = (
    status: string
  ): "default" | "secondary" | "outline" => {
    switch (status) {
      case "completed":
        return "default";
      case "in-progress":
        return "secondary";
      case "scheduled":
        return "outline";
      default:
        return "secondary";
    }
  };

  // Get logo for issuer with fallback
  const getIssuerLogo = (issuer: string, certification: Certification) => {
    const issuerLower = issuer.toLowerCase();
    let logoPath = "";
    let fallbackIcon = "🎓";
    let fallbackBg = "bg-gray-500";

    if (issuerLower.includes("bloomberg")) {
      logoPath = "/images/certifications/bloomberg-logo.jpg";
      fallbackIcon = "📊";
      fallbackBg = "bg-blue-600";
    } else if (issuerLower.includes("cfa")) {
      logoPath = "/images/certifications/cfa-logo.png";
      fallbackIcon = "🏆";
      fallbackBg = "bg-primary";
    } else if (issuerLower.includes("morgan")) {
      logoPath = "/images/certifications/amplifymeofficial_logo.jpeg";
      fallbackIcon = "🏛️";
      fallbackBg = "bg-blue-800";
    } else if (issuerLower.includes("ubs")) {
      logoPath = "/images/certifications/amplifymeofficial_logo.jpeg";
      fallbackIcon = "🏛️";
      fallbackBg = "bg-red-600";
    } else if (issuerLower.includes("gre") || issuerLower.includes("ets")) {
      logoPath = "/images/certifications/gre-logo.png";
      fallbackIcon = "📝";
      fallbackBg = "bg-purple-600";
    } else if (
      issuerLower.includes("university") ||
      issuerLower.includes("college")
    ) {
      logoPath = "/images/certifications/msc-finance-logo.png";
      fallbackIcon = "🎓";
      fallbackBg = "bg-green-600";
    }

    const logoId = `${certification.id}-logo`;

    if (logoErrors.has(logoId) || !logoPath) {
      return (
        <div
          className={`w-12 h-12 ${fallbackBg} rounded-lg flex items-center justify-center shadow-md`}
        >
          <span className="text-xl">{fallbackIcon}</span>
        </div>
      );
    }

    return (
      <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-md p-1">
        <Image
          src={logoPath}
          alt={`${issuer} Logo`}
          width={48}
          height={48}
          className="w-full h-full object-contain"
          onError={() => handleLogoError(logoId)}
          loading="lazy"
        />
      </div>
    );
  };

  // Get provider logo for the bottom section
  const getProviderLogo = (
    provider: string,
    size: "large" | "small" = "large"
  ) => {
    const providerLower = provider.toLowerCase();
    let logoPath = "";
    let fallbackIcon = "🎓";
    let fallbackBg = "bg-gray-500";

    if (providerLower.includes("bloomberg")) {
      logoPath = "/images/certifications/bloomberg-logo.jpg";
      fallbackIcon = "📊";
      fallbackBg = "bg-blue-600";
    } else if (providerLower.includes("cfa")) {
      logoPath = "/images/certifications/cfa-logo.png";
      fallbackIcon = "🏆";
      fallbackBg = "bg-primary";
    } else if (
      providerLower.includes("investment") ||
      providerLower.includes("banks")
    ) {
      logoPath = "/images/certifications/amplifymeofficial_logo.jpeg";
      fallbackIcon = "🏛️";
      fallbackBg = "bg-purple-600";
    }

    const logoId = `provider-${provider.replace(/\s+/g, "-").toLowerCase()}`;
    const logoSize = size === "large" ? "w-16 h-16" : "w-8 h-8";
    const imageDimensions = size === "large" ? 64 : 32;
    const iconSize = size === "large" ? "text-3xl" : "text-xl";

    if (logoErrors.has(logoId) || !logoPath) {
      return (
        <div
          className={`${logoSize} ${fallbackBg} rounded-lg flex items-center justify-center shadow-lg`}
        >
          <span className={iconSize}>{fallbackIcon}</span>
        </div>
      );
    }

    return (
      <div
        className={`${logoSize} bg-white rounded-lg flex items-center justify-center shadow-lg p-2`}
      >
        <Image
          src={logoPath}
          alt={`${provider} Logo`}
          width={imageDimensions}
          height={imageDimensions}
          className="w-full h-full object-contain"
          onError={() => handleLogoError(logoId)}
          loading="lazy"
        />
      </div>
    );
  };

  const completedCertifications = certifications.filter(
    (cert) => cert.status === "completed"
  );
  const inProgressCertifications = certifications.filter(
    (cert) => cert.status === "in-progress"
  );
  const scheduledCertifications = certifications.filter(
    (cert) => cert.status === "scheduled"
  );

  return (
    <section id="certifications" className="py-20 bg-background" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Certifications & Credentials
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Professional certifications demonstrating expertise in financial
            markets and analysis
          </p>
        </motion.div>

        {/* Certifications Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {certifications.map((certification, index) => {
            const StatusIcon = getStatusIcon(certification.status);

            return (
              <motion.div
                key={certification.id}
                initial={{ opacity: 0, y: 30 }}
                animate={
                  isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }
                }
                transition={{ duration: 0.6, delay: 0.2 + index * 0.1 }}
              >
                <Card className="border-none shadow-lg hover:shadow-xl transition-shadow duration-300 h-full">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          {getIssuerLogo(certification.issuer, certification)}
                          <Badge
                            variant={getStatusBadgeVariant(
                              certification.status
                            )}
                            className="capitalize"
                          >
                            {certification.status === "scheduled"
                              ? "Upcoming"
                              : certification.status}
                          </Badge>
                        </div>
                        <CardTitle className="text-xl font-bold text-foreground mb-2">
                          {certification.name}
                        </CardTitle>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Building className="h-4 w-4" />
                          <span className="font-semibold text-primary">
                            {certification.issuer}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`${getStatusColor(certification.status)}`}
                      >
                        <StatusIcon className="h-6 w-6" />
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Issue Date */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {certification.status === "scheduled"
                          ? `Scheduled: ${certification.scheduledDate}`
                          : `Issued: ${certification.issueDate}`}
                      </span>
                    </div>

                    {/* Credential ID */}
                    {certification.credentialId && (
                      <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                        <div className="text-xs text-muted-foreground mb-1">
                          Credential ID
                        </div>
                        <div className="font-mono text-sm text-foreground break-all">
                          {certification.credentialId}
                        </div>
                      </div>
                    )}

                    {/* Verification Link */}
                    {certification.status === "completed" && (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span>Verify Credential</span>
                      </motion.button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Certification Statistics */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mb-16"
        >
          <Card className="border-none shadow-lg bg-gradient-to-r from-primary/5 to-blue-600/5">
            <CardContent className="p-8">
              <h3 className="text-xl font-semibold text-foreground mb-8 text-center">
                Certification Progress
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                <div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={isInView ? { scale: 1 } : { scale: 0 }}
                    transition={{ duration: 0.6, delay: 1 }}
                    className="text-4xl font-bold text-green-600 mb-2"
                  >
                    {completedCertifications.length}
                  </motion.div>
                  <div className="text-sm text-muted-foreground">Completed</div>
                </div>
                <div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={isInView ? { scale: 1 } : { scale: 0 }}
                    transition={{ duration: 0.6, delay: 1.1 }}
                    className="text-4xl font-bold text-blue-600 mb-2"
                  >
                    {inProgressCertifications.length}
                  </motion.div>
                  <div className="text-sm text-muted-foreground">
                    In Progress
                  </div>
                </div>
                <div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={isInView ? { scale: 1 } : { scale: 0 }}
                    transition={{ duration: 0.6, delay: 1.2 }}
                    className="text-4xl font-bold text-orange-600 mb-2"
                  >
                    {scheduledCertifications.length}
                  </motion.div>
                  <div className="text-sm text-muted-foreground">Scheduled</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Certification Providers */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6, delay: 1 }}
        >
          <Card className="border-none shadow-lg">
            <CardContent className="p-8">
              <h3 className="text-xl font-semibold text-foreground mb-8 text-center">
                Certification Providers
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Bloomberg */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={
                    isInView
                      ? { opacity: 1, scale: 1 }
                      : { opacity: 0, scale: 0.9 }
                  }
                  transition={{ duration: 0.4, delay: 1.2 }}
                  className="text-center p-6 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800"
                >
                  <div className="flex justify-center mb-4">
                    {getProviderLogo("Bloomberg")}
                  </div>
                  <h4 className="font-semibold text-foreground mb-2">
                    Bloomberg
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Financial markets and data analysis certifications
                  </p>
                  <Badge variant="secondary">
                    {
                      certifications.filter((c) =>
                        c.issuer.includes("Bloomberg")
                      ).length
                    }{" "}
                    Certifications
                  </Badge>
                </motion.div>

                {/* CFA Institute */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={
                    isInView
                      ? { opacity: 1, scale: 1 }
                      : { opacity: 0, scale: 0.9 }
                  }
                  transition={{ duration: 0.4, delay: 1.3 }}
                  className="text-center p-6 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800"
                >
                  <div className="flex justify-center mb-4">
                    {getProviderLogo("CFA Institute")}
                  </div>
                  <h4 className="font-semibold text-foreground mb-2">
                    CFA Institute
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Chartered Financial Analyst program
                  </p>
                  <Badge variant="secondary">Level 1 Candidate</Badge>
                </motion.div>

                {/* Investment Banks */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={
                    isInView
                      ? { opacity: 1, scale: 1 }
                      : { opacity: 0, scale: 0.9 }
                  }
                  transition={{ duration: 0.4, delay: 1.4 }}
                  className="text-center p-6 rounded-lg bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800"
                >
                  <div className="flex justify-center mb-4">
                    {getProviderLogo("Investment Banks")}
                  </div>
                  <h4 className="font-semibold text-foreground mb-2">
                    Investment Banks
                  </h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Finance accelerator programs
                  </p>
                  <Badge variant="secondary">Morgan Stanley & UBS</Badge>
                </motion.div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
