"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, Download } from "lucide-react";
import { personalData } from "@/lib/data";
import { ModeToggle } from "@/components/mode-toggle";

const navigation = [
  { name: "Projects", href: "#projects" },
  { name: "About", href: "#about" },
  { name: "Experience", href: "#experience" },
  { name: "Skills", href: "#skills" },
  { name: "Education", href: "#education" },
  { name: "Certifications", href: "#certifications" },
  { name: "Contact", href: "#contact" },
];

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      setIsMobileMenuOpen(false);
    }
  };

  const handleDownloadCV = async () => {
    try {
      // Clear any previous errors
      setDownloadError("");

      // Path to your CV in the public folder
      const cvPath = "/cv/reza.pdf";

      // Check if file exists by trying to fetch it
      const response = await fetch(cvPath, { method: "HEAD" });
      if (!response.ok) {
        throw new Error(`CV file not found: ${response.status}`);
      }

      // Create download link
      const link = document.createElement("a");
      link.href = cvPath;
      link.download = `${personalData.name.replace(/\s+/g, "_")}_CV.pdf`; // Use your name for the downloaded file
      link.target = "_blank";

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log("CV download initiated successfully");
    } catch (error) {
      console.error("CV download error:", error);
      setDownloadError("Failed to download CV. Please try again later.");

      // Clear error after 3 seconds
      setTimeout(() => {
        setDownloadError("");
      }, 3000);
    }
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? "bg-background/80 backdrop-blur-md border-b shadow-sm"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            {/* Logo/Name */}
            <div className="flex-shrink-0">
              <button
                onClick={() => scrollToSection("#hero")}
                className="text-xl font-bold text-foreground hover:text-primary transition-colors"
              >
                {personalData.name.split(" ").map((name, index) => (
                  <span
                    key={index}
                    className={index === 0 ? "text-primary" : ""}
                  >
                    {name}{" "}
                  </span>
                ))}
              </button>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex space-x-8">
              {navigation.map((item) => (
                <button
                  key={item.name}
                  onClick={() => scrollToSection(item.href)}
                  className="text-muted-foreground hover:text-foreground transition-colors duration-200 font-medium"
                >
                  {item.name}
                </button>
              ))}
            </nav>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center space-x-4">
              <ModeToggle />
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={handleDownloadCV}
              >
                <Download className="h-4 w-4" />
                Download CV
              </Button>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center space-x-2">
              <ModeToggle />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2"
              >
                {isMobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </Button>
            </div>
          </div>

          {/* Mobile Navigation Menu */}
          {isMobileMenuOpen && (
            <div className="md:hidden">
              <div className="px-2 pt-2 pb-3 space-y-1 bg-background/95 backdrop-blur-md border border-border rounded-lg mb-4">
                {navigation.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => scrollToSection(item.href)}
                    className="block w-full text-left px-3 py-2 text-base font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-200 rounded-md"
                  >
                    {item.name}
                  </button>
                ))}
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full flex items-center justify-center gap-2"
                    onClick={() => {
                      handleDownloadCV();
                      setIsMobileMenuOpen(false);
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Download CV
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Error Toast */}
      {downloadError && (
        <div className="fixed top-20 right-4 z-[60] max-w-sm">
          <div className="bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-3 shadow-lg">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <X className="h-4 w-4" />
              <span className="text-sm">{downloadError}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
