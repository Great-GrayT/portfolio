"use client";

import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { projects } from "@/lib/data";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  Zap,
  BarChart3,
  TrendingUp,
  Code,
  Filter,
  ExternalLink,
  Briefcase,
  Download,
  Github,
  Linkedin,
  Globe,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
  Calendar,
  Award,
  FileText,
  File,
  FileSpreadsheet,
  FileImage,
  ChevronDown,
  Clock,
} from "lucide-react";

const PROJECTS_PER_PAGE = 6;

export default function ProjectsSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedIndustry, setSelectedIndustry] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProject, setSelectedProject] = useState(null);
  // Track which images failed to load
  const [imageErrors, setImageErrors] = useState(new Set());
  const [downloadErrors, setDownloadErrors] = useState({});
  const [showFileSelector, setShowFileSelector] = useState(false);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "automation":
        return Zap;
      case "analysis":
        return BarChart3;
      case "modeling":
        return TrendingUp;
      case "development":
        return Code;
      default:
        return Briefcase;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "automation":
        return "bg-blue-500";
      case "analysis":
        return "bg-green-500";
      case "modeling":
        return "bg-purple-500";
      case "development":
        return "bg-orange-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200";
      case "ongoing":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200";
      case "archived":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-200";
    }
  };

  // Industry-specific color schemes with fallback Tailwind classes
  const getIndustryColors = (industry) => {
    const industryColors = {
      Telecommunications: {
        cssClass: "bg-gradient-to-br from-blue-600 to-cyan-600",
        text: "text-white",
        icon: "bg-blue-700 dark:bg-blue-600",
      },
      "Asset Management": {
        cssClass: "bg-gradient-to-br from-green-600 to-emerald-600",
        text: "text-white",
        icon: "bg-green-700 dark:bg-green-600",
      },
      "Institutional Finance": {
        cssClass: "bg-gradient-to-br from-purple-600 to-indigo-600",
        text: "text-white",
        icon: "bg-purple-700 dark:bg-purple-600",
      },
      "Pharmaceutical & Healthcare": {
        cssClass: "bg-gradient-to-br from-red-600 to-pink-600",
        text: "text-white",
        icon: "bg-red-700 dark:bg-red-600",
      },
      "Real Estate Finance": {
        cssClass: "bg-gradient-to-br from-orange-600 to-amber-600",
        text: "text-white",
        icon: "bg-orange-700 dark:bg-orange-600",
      },
      "Cryptocurrency & DeFi": {
        cssClass: "bg-gradient-to-br from-yellow-600 to-orange-600",
        text: "text-white",
        icon: "bg-yellow-700 dark:bg-yellow-600",
      },
    };
    return (
      industryColors[industry] || {
        cssClass: "bg-gradient-to-br from-gray-600 to-slate-600",
        text: "text-white",
        icon: "bg-gray-700 dark:bg-gray-600",
      }
    );
  };

  const getFileTypeIcon = (fileType) => {
    switch (fileType) {
      case "pdf":
        return FileText;
      case "excel":
        return FileSpreadsheet;
      case "word":
        return FileText;
      case "powerpoint":
        return FileImage;
      case "other":
        return File;
      default:
        return File;
    }
  };

  const getFileTypeColor = (fileType) => {
    switch (fileType) {
      case "pdf":
        return "text-red-600";
      case "excel":
        return "text-green-600";
      case "word":
        return "text-blue-600";
      case "powerpoint":
        return "text-orange-600";
      case "other":
        return "text-gray-600";
      default:
        return "text-gray-600";
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Create fallback image with project title and industry colors
  const createFallbackImage = (project) => {
    const colors = getIndustryColors(project.industry);

    return (
      <div
        className={`w-full h-full ${colors.cssClass} flex flex-col items-center justify-center p-4 transition-colors duration-300`}
      >
        <div
          className={`w-12 h-12 ${colors.icon} rounded-lg flex items-center justify-center mb-3 shadow-lg`}
        >
          {React.createElement(getCategoryIcon(project.category), {
            className: "h-6 w-6 text-white",
          })}
        </div>
        <h3
          className={`${colors.text} text-lg font-bold text-center leading-tight drop-shadow-sm`}
        >
          {project.name}
        </h3>
        <p
          className={`${colors.text} text-sm opacity-90 mt-2 text-center drop-shadow-sm`}
        >
          {project.industry}
        </p>
      </div>
    );
  };

  const handleImageError = (projectId) => {
    console.log(`Image failed for project ${projectId}`);
    setImageErrors((prev) => new Set([...prev, projectId]));
  };

  const handleImageLoad = (projectId) => {
    console.log(`Image loaded successfully for project ${projectId}`);
    setImageErrors((prev) => {
      const newSet = new Set(prev);
      newSet.delete(projectId);
      return newSet;
    });
  };

  const handleDownload = async (file, projectId) => {
    if (!file || !file.filePath) {
      setDownloadErrors((prev) => ({
        ...prev,
        [projectId]: `File not available`,
      }));
      return;
    }

    try {
      setDownloadErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[projectId];
        return newErrors;
      });

      const link = document.createElement("a");
      link.href = file.filePath;
      link.download = file.fileName;
      link.target = "_blank";

      const response = await fetch(file.filePath, { method: "HEAD" });
      if (!response.ok) {
        throw new Error(`File not found: ${response.status}`);
      }

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Download error:", error);
      setDownloadErrors((prev) => ({
        ...prev,
        [projectId]: `Failed to download ${file.fileName}`,
      }));

      setTimeout(() => {
        setDownloadErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[projectId];
          return newErrors;
        });
      }, 3000);
    }
  };

  // Filter and search logic
  const filteredProjects = projects.filter((project) => {
    const matchesCategory =
      selectedCategory === "all" || project.category === selectedCategory;
    const matchesIndustry =
      selectedIndustry === "all" || project.industry === selectedIndustry;
    const matchesSearch =
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.technologies.some((tech) =>
        tech.toLowerCase().includes(searchTerm.toLowerCase())
      );

    return matchesCategory && matchesIndustry && matchesSearch;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE);
  const startIndex = (currentPage - 1) * PROJECTS_PER_PAGE;
  const paginatedProjects = filteredProjects.slice(
    startIndex,
    startIndex + PROJECTS_PER_PAGE
  );

  // Get unique industries
  const industries = ["all", ...new Set(projects.map((p) => p.industry))];

  const categories = [
    { id: "all", name: "All Projects", count: projects.length },
    {
      id: "automation",
      name: "Automation",
      count: projects.filter((p) => p.category === "automation").length,
    },
    {
      id: "analysis",
      name: "Analysis",
      count: projects.filter((p) => p.category === "analysis").length,
    },
    {
      id: "modeling",
      name: "Modeling",
      count: projects.filter((p) => p.category === "modeling").length,
    },
    {
      id: "development",
      name: "Development",
      count: projects.filter((p) => p.category === "development").length,
    },
  ];

  const openFileSelector = () => setShowFileSelector(true);
  const closeFileSelector = () => setShowFileSelector(false);

  const openProjectModal = (project) => {
    setSelectedProject(project);
    setDownloadErrors({});
    setShowFileSelector(false);
  };

  const closeProjectModal = () => {
    setSelectedProject(null);
    setDownloadErrors({});
    setShowFileSelector(false);
  };

  return (
    <>
      <section
        id="projects"
        className="py-20 bg-slate-50/50 dark:bg-slate-900/50 min-h-screen"
        ref={ref}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl sm:text-5xl font-bold text-foreground mb-6 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent">
              Financial Projects Portfolio
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Comprehensive collection of valuation models, financial analyses,
              quantitative research, and fintech solutions
            </p>
          </motion.div>

          {/* Search and Filters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-12 space-y-6"
          >
            {/* Search Bar */}
            <div className="relative max-w-md mx-auto">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <input
                type="text"
                placeholder="Search projects, technologies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-full border border-border bg-background/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>

            {/* Category Filters */}
            <div className="flex flex-wrap justify-center gap-3">
              {categories.map((category, index) => (
                <motion.button
                  key={category.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={
                    isInView
                      ? { opacity: 1, scale: 1 }
                      : { opacity: 0, scale: 0.9 }
                  }
                  transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${
                    selectedCategory === category.id
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "bg-background/70 text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-border"
                  }`}
                >
                  <Filter className="h-4 w-4" />
                  <span className="font-medium">{category.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {category.count}
                  </Badge>
                </motion.button>
              ))}
            </div>

            {/* Industry Filter */}
            <div className="flex flex-wrap justify-center gap-2">
              {industries.map((industry) => (
                <button
                  key={industry}
                  onClick={() => setSelectedIndustry(industry)}
                  className={`px-3 py-1 text-sm rounded-full transition-all ${
                    selectedIndustry === industry
                      ? "bg-accent text-accent-foreground"
                      : "bg-background/50 text-muted-foreground hover:bg-accent/50"
                  }`}
                >
                  {industry === "all" ? "All Industries" : industry}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Projects Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
            <AnimatePresence>
              {paginatedProjects.map((project, index) => {
                const IconComponent = getCategoryIcon(project.category);

                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 30, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -30, scale: 0.9 }}
                    transition={{ duration: 0.6, delay: index * 0.1 }}
                    layout
                    className="group cursor-pointer"
                    onClick={() => openProjectModal(project)}
                  >
                    <Card className="border-none shadow-xl hover:shadow-2xl transition-all duration-500 h-full bg-gradient-to-br from-background/80 to-background/40 backdrop-blur-sm hover:scale-105 group-hover:border-primary/50 overflow-hidden p-0">
                      {/* Project Image */}
                      <div className="relative h-48 overflow-hidden">
                        {imageErrors.has(project.id) ? (
                          <div className="w-full h-full">
                            {createFallbackImage(project)}
                          </div>
                        ) : (
                          <img
                            src={project.image}
                            alt={project.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            onError={() => handleImageError(project.id)}
                            onLoad={() => handleImageLoad(project.id)}
                            loading="lazy"
                          />
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                        {/* Status Badge */}
                        <div className="absolute top-3 left-3">
                          <Badge
                            className={`${getStatusColor(
                              project.status
                            )} border-0`}
                          >
                            {project.status}
                          </Badge>
                        </div>

                        {/* Category Icon */}
                        <div
                          className={`absolute top-3 right-3 w-10 h-10 ${getCategoryColor(
                            project.category
                          )} rounded-lg flex items-center justify-center opacity-90`}
                        >
                          <IconComponent className="h-5 w-5 text-white" />
                        </div>

                        {/* Quick Actions Overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                          <div className="flex space-x-3">
                            {project.socialLinks?.github && (
                              <button className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors">
                                <Github className="h-4 w-4 text-white" />
                              </button>
                            )}
                            {project.socialLinks?.linkedin && (
                              <button className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors">
                                <Linkedin className="h-4 w-4 text-white" />
                              </button>
                            )}
                            <button className="p-2 bg-primary/80 rounded-full hover:bg-primary transition-colors">
                              <ExternalLink className="h-4 w-4 text-white" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <CardHeader className="pb-3 px-6 pt-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors leading-tight">
                              {project.name}
                            </h3>
                            <p className="text-sm text-primary font-medium mt-1">
                              {project.industry}
                            </p>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4 px-6 pb-6">
                        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">
                          {project.description}
                        </p>

                        {/* Technologies */}
                        <div className="flex flex-wrap gap-1">
                          {project.technologies
                            .slice(0, 3)
                            .map((tech, techIndex) => (
                              <Badge
                                key={techIndex}
                                variant="secondary"
                                className="text-xs"
                              >
                                {tech}
                              </Badge>
                            ))}
                          {project.technologies.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{project.technologies.length - 3}
                            </Badge>
                          )}
                        </div>

                        {/* Project Stats */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                          {project.duration && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {project.duration}
                            </div>
                          )}
                          {project.teamSize && (
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {project.teamSize} members
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="flex justify-center items-center space-x-4"
            >
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-full bg-background border border-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex space-x-2">
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-10 h-10 rounded-full transition-all ${
                      currentPage === i + 1
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "bg-background hover:bg-accent border border-border"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <button
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
                className="p-2 rounded-full bg-background border border-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </motion.div>
          )}

          {/* Results Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 1 }}
            className="text-center mt-8 text-muted-foreground"
          >
            Showing {startIndex + 1}-
            {Math.min(startIndex + PROJECTS_PER_PAGE, filteredProjects.length)}{" "}
            of {filteredProjects.length} projects
          </motion.div>
        </div>
      </section>

      {/* Project Detail Modal */}
      <AnimatePresence>
        {selectedProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={closeProjectModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-background rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="relative">
                {imageErrors.has(selectedProject.id) ? (
                  <div className="h-64 rounded-t-2xl overflow-hidden">
                    {createFallbackImage(selectedProject)}
                  </div>
                ) : (
                  <img
                    src={selectedProject.image}
                    alt={selectedProject.name}
                    className="w-full h-64 object-cover rounded-t-2xl"
                    onError={() => handleImageError(selectedProject.id)}
                    loading="lazy"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent rounded-t-2xl" />

                <button
                  onClick={closeProjectModal}
                  className="absolute top-4 right-4 p-2 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
                >
                  <X className="h-5 w-5 text-white" />
                </button>

                <div className="absolute bottom-6 left-6 right-6">
                  <div className="flex items-center gap-3 mb-3">
                    <Badge
                      className={`${getStatusColor(
                        selectedProject.status
                      )} border-0`}
                    >
                      {selectedProject.status}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="bg-black/50 text-white border-white/20"
                    >
                      {selectedProject.category}
                    </Badge>
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-2">
                    {selectedProject.name}
                  </h2>
                  <p className="text-white/90 text-lg">
                    {selectedProject.industry}
                  </p>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-8">
                {/* Project Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="text-center p-4 bg-accent/10 rounded-lg">
                    <Calendar className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <div className="font-semibold">
                      {selectedProject.duration}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Duration
                    </div>
                  </div>
                  <div className="text-center p-4 bg-accent/10 rounded-lg">
                    <Users className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <div className="font-semibold">
                      {selectedProject.teamSize} members
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Team Size
                    </div>
                  </div>
                  <div className="text-center p-4 bg-accent/10 rounded-lg">
                    <Award className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <div className="font-semibold">
                      {selectedProject.status}
                    </div>
                    <div className="text-sm text-muted-foreground">Status</div>
                  </div>
                </div>

                {/* Description */}
                <div className="mb-8">
                  <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Project Overview
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {selectedProject.fullDescription}
                  </p>
                </div>

                {/* Impact */}
                {selectedProject.impact && (
                  <div className="mb-8 p-6 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg border-l-4 border-green-500">
                    <h3 className="text-lg font-semibold mb-2 text-green-800 dark:text-green-200">
                      Impact & Results
                    </h3>
                    <p className="text-green-700 dark:text-green-300">
                      {selectedProject.impact}
                    </p>
                  </div>
                )}

                {/* Technologies & Languages */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">
                      Technologies & Tools
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedProject.technologies.map((tech, index) => (
                        <Badge key={index} variant="secondary">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-4">
                      Programming Languages
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedProject.languages.map((lang, index) => (
                        <Badge key={index} variant="outline">
                          {lang}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-4 justify-between">
                  {/* Download Links */}
                  <div className="flex flex-wrap gap-3">
                    {selectedProject.files &&
                      selectedProject.files.length > 0 && (
                        <button
                          onClick={openFileSelector}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                          <Download className="h-4 w-4" />
                          Download Files
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      )}
                  </div>

                  {/* Error Messages */}
                  {downloadErrors[selectedProject.id] && (
                    <div className="w-full mt-4">
                      <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
                        <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
                          <X className="h-4 w-4" />
                          <span className="text-sm">
                            {downloadErrors[selectedProject.id]}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Social Links */}
                  <div className="flex gap-3">
                    {selectedProject.socialLinks?.github && (
                      <a
                        href={selectedProject.socialLinks.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-gray-800 hover:bg-gray-900 text-white rounded-lg transition-colors"
                      >
                        <Github className="h-5 w-5" />
                      </a>
                    )}
                    {selectedProject.socialLinks?.linkedin && (
                      <a
                        href={selectedProject.socialLinks.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      >
                        <Linkedin className="h-5 w-5" />
                      </a>
                    )}
                    {selectedProject.socialLinks?.website && (
                      <a
                        href={selectedProject.socialLinks.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
                      >
                        <Globe className="h-5 w-5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File Selector Modal */}
      <AnimatePresence>
        {showFileSelector && selectedProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={closeFileSelector}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-background rounded-2xl shadow-2xl max-w-2xl w-full max-h-[70vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* File Selector Header */}
              <div className="flex items-center justify-between p-6 border-b border-border">
                <div>
                  <h3 className="text-xl font-semibold">Download Files</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    {selectedProject.name}
                  </p>
                </div>
                <button
                  onClick={closeFileSelector}
                  className="p-2 hover:bg-accent rounded-full transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Files List */}
              <div className="p-6">
                <div className="space-y-3">
                  {selectedProject.files?.map((file, index) => {
                    const FileIcon = getFileTypeIcon(file.type);

                    return (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center justify-between p-4 bg-accent/5 hover:bg-accent/10 rounded-lg border border-border/50 transition-colors"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div
                            className={`p-2 rounded-lg bg-background ${getFileTypeColor(
                              file.type
                            )}`}
                          >
                            <FileIcon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-foreground truncate">
                              {file.fileName}
                            </h4>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                              <span className="capitalize">
                                {file.language}
                              </span>
                              <span>v{file.version}</span>
                              {file.fileSize && <span>{file.fileSize}</span>}
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{formatDate(file.lastUpdated)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            handleDownload(file, selectedProject.id);
                            closeFileSelector();
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </button>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Quick File Type Filters */}
                <div className="mt-6 pt-6 border-t border-border">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3">
                    Quick Access by File Type
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(
                      new Set(selectedProject.files?.map((f) => f.type) || [])
                    ).map((fileType) => {
                      const filesOfType =
                        selectedProject.files?.filter(
                          (f) => f.type === fileType
                        ) || [];
                      const FileIcon = getFileTypeIcon(fileType);

                      return (
                        <div key={fileType} className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="flex items-center gap-1"
                          >
                            <FileIcon
                              className={`h-3 w-3 ${getFileTypeColor(
                                fileType
                              )}`}
                            />
                            {fileType.toUpperCase()} ({filesOfType.length})
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {(!selectedProject.files ||
                  selectedProject.files.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    <File className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No files available for download</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
