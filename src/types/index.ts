export interface PersonalData {
  name: string;
  title: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  linkedin: string;
  website: string;
  location: string;
}

export interface WorkExperience {
  id: string;
  position: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  responsibilities: string[];
  achievements: string[];
  projects?: string[];
}

export interface Education {
  id: string;
  degree: string;
  field: string;
  institution: string;
  location: string;
  startDate: string;
  endDate: string;
  gpa?: string;
  ranking?: string;
  graduationDate?: string;
  description?: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  issueDate: string;
  status: "completed" | "in-progress" | "scheduled";
  credentialId?: string;
  url: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  fullDescription: string;
  technologies: string[];
  languages: string[];
  category: "automation" | "analysis" | "modeling" | "development" | "finTech";
  industry: string;
  image: string;
  files: ProjectFile[];
  socialLinks: {
    github?: string;
    linkedin?: string;
    website?: string;
  };
  impact?: string;
  status: "completed" | "ongoing" | "archived";
  duration?: string;
  teamSize?: number;
}

export interface ProjectFile {
  id: string;
  type: "pdf" | "excel" | "word" | "powerpoint" | "other";
  language: "English" | "Farsi" | "Arabic" | "Spanish" | "French";
  version: string;
  lastUpdated: string;
  filePath: string;
  fileName: string;
  fileSize?: string;
}

export interface Skill {
  name: string;
  level: "familiar" | "intermediate" | "advanced";
  category: "programming" | "software" | "finance" | "soft";
}

export interface SkillCategory {
  name: string;
  skills: Skill[];
}

export interface ContactInfo {
  name: string;
  email: string;
  message: string;
  subject?: string;
}
