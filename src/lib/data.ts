import {
  PersonalData,
  WorkExperience,
  Education,
  Certification,
  Project,
  SkillCategory,
} from "@/types";

export const personalData: PersonalData = {
  name: "Seyed Reza Fakhr Hosseini",
  title: "Quantitative Financial Analyst",
  dateOfBirth: "10 Dec 2000",
  phone: "+447351036696",
  email: "rzafh79@gmail.com",
  linkedin: "https://linkedin.com/in/reza-fakhr-hosseini",
  website: "rezafh.com",
  location: "13 Merrow Walk, Manchester, UK, M1 7JN",
};

export const personalStatement = `Investment modeling, financial analysis, and valuation for 50+ companies across key sectors, contributing as an analyst for Iran's 39th largest mutual fund, which achieved a top 20 national ranking out of 519 funds during my tenure. Self-taught since 19, I was promoted to Senior Analyst by 23 at a leading financial institution. With a background in electronic engineering and a Master's in Finance from the UK, I bring a proven blend of technical, analytical, and strategic skills, committed to delivering value in an investment role.`;

export const workExperience: WorkExperience[] = [
  {
    id: "1",
    position: "Investment Analyst",
    company: "Tadbirgaran Farda",
    location: "Tehran, Iran",
    startDate: "April 2020",
    endDate: "Sep 2024",
    responsibilities: [
      "Conducted investment modeling and valuation for 50+ companies across 8 sectors",
      "Covered: Oil Refinery, Power Plant, Gold, Copper, Ferrosilicon, Aluminium, Cement, and Dairy sectors",
      "Applied advanced valuation techniques (P/E, P/S, EV/B, DDM, FCFF, FCFE) to drive key investment decisions",
      "Led M&A projects including Barekat Financial Group's valuation (The Biggest Pharmaceutical Group in Iran)",
      "Automated data extraction with Python, VBA, Power BI, and PostgreSQL and variance simulation projects using XGBoost, Machine Learning (LSTM, GRU, random forests, etc.)",
    ],
    achievements: [
      "Improved mutual fund performance from the 100-150 range to top 20 out of 519 equity funds in 2 years",
      "Boosted annual returns from 8.57% & 11.83% to 43.06% & 32.31%, outperforming market indices",
      "Reduced portfolio risk by advising a 1/3 equity composition cut, preventing losses during a 23% market correction",
      "Accelerated analysis by 100% through automation",
      "Successfully contributed to IPO of subsidiaries through M&A valuation projects",
    ],
    projects: [
      "Valuation Report of 'Barekat Financial Group' (The Biggest Pharmaceutical Group in the country)",
      "Designing database and backend for Setad (One of the biggest organizations in Iran) Portfolio Management Application",
      "Contribute in Designing and Developing Algorithms Backend for First Fund Specific Platform of Iran (Polaris)",
      "Automated Excel and Power BI Dashboard For Portfolio Management of 'Moshtarak Tadbir'",
    ],
  },
];

export const education: Education[] = [
  {
    id: "1",
    degree: "Master of Science",
    field: "Finance",
    institution: "Manchester Metropolitan University",
    location: "Manchester, UK",
    startDate: "Sep 2024",
    endDate: "Sep 2025",
    gpa: "Grade: 1:1",
    ranking: "QS World University Ranking: #51+",
    description:
      "Focus on advanced financial analysis, investment management, and corporate finance",
  },
  {
    id: "2",
    degree: "Bachelor of Science",
    field: "Biomedical Engineering (Bioelectrics)",
    institution: "Amirkabir University of Technology",
    location: "Tehran, Iran",
    startDate: "Sep 2019",
    endDate: "July 2024",
    gpa: "3.45/4 GPA",
    ranking:
      "Rank #1 BioElectrics Department in Iran (Ministry of Science ranking)",
    description:
      "Strong foundation in engineering mathematics, signal processing, and analytical thinking",
  },
  {
    id: "3",
    degree: "Minor Course",
    field: "Economics",
    institution: "Amirkabir University of Technology",
    location: "Tehran, Iran",
    startDate: "May 2021",
    endDate: "Dec 2022",
    gpa: "3.8/4 GPA",
    description:
      "Complemented engineering background with economic theory and financial principles",
  },
];

export const certifications: Certification[] = [
  {
    id: "1",
    name: "CFA Level 1 (Expected in early Oct)",
    issuer: "CFA Institute",
    issueDate: "2025",
    status: "scheduled",
  },
  {
    id: "2",
    name: "Bloomberg Market Concepts",
    issuer: "Bloomberg",
    issueDate: "2025",
    status: "completed",
  },
  {
    id: "3",
    name: "Bloomberg Spreadsheet Analysis",
    issuer: "Bloomberg",
    issueDate: "2025",
    status: "completed",
  },
  {
    id: "4",
    name: "Environmental Social Governance",
    issuer: "Bloomberg",
    issueDate: "2025",
    status: "completed",
  },
  {
    id: "5",
    name: "Finance Accelerator",
    issuer: "Morgan Stanley & UBS",
    issueDate: "2024",
    status: "completed",
  },
  {
    id: "6",
    name: "GRE",
    issuer: "GRE® General Test",
    issueDate: "2023",
    status: "completed",
  },
];

export const skillCategories: SkillCategory[] = [
  {
    name: "Investment Analysis",
    skills: [
      {
        name: "Financial and Investment Spreadsheet Modelling",
        level: "advanced",
        category: "finance",
      },
      {
        name: "Merge/Acquisition Modelling",
        level: "advanced",
        category: "finance",
      },
      { name: "Asset Management", level: "advanced", category: "finance" },
      {
        name: "Discounted Cash Flow (DCF) Modelling",
        level: "advanced",
        category: "finance",
      },
      {
        name: "Financial Statement Analysis",
        level: "advanced",
        category: "finance",
      },
      { name: "Valuation", level: "advanced", category: "finance" },
      { name: "Risk Assessment", level: "advanced", category: "finance" },
      { name: "Portfolio Management", level: "advanced", category: "finance" },
    ],
  },
  {
    name: "Software Skills",
    skills: [
      { name: "Excel", level: "advanced", category: "software" },
      { name: "Power BI", level: "advanced", category: "software" },
      { name: "GitHub", level: "intermediate", category: "software" },
      { name: "VS Code", level: "intermediate", category: "software" },
      {
        name: "Bloomberg Terminal",
        level: "intermediate",
        category: "software",
      },
      { name: "Refinitiv Eikon", level: "intermediate", category: "software" },
    ],
  },
  {
    name: "Programming Skills",
    skills: [
      { name: "VBA", level: "advanced", category: "programming" },
      { name: "Python", level: "advanced", category: "programming" },
      { name: "MATLAB", level: "advanced", category: "programming" },
      { name: "R", level: "intermediate", category: "programming" },
      { name: "C#", level: "familiar", category: "programming" },
      {
        name: "Bloomberg Terminal",
        level: "intermediate",
        category: "programming",
      },
      {
        name: "Refinitiv Eikon",
        level: "intermediate",
        category: "programming",
      },
    ],
  },
  {
    name: "Other Skills",
    skills: [
      { name: "Football", level: "familiar", category: "soft" },
      { name: "Piano", level: "intermediate", category: "soft" },
    ],
  },
];

export const projects: Project[] = [
  {
    id: "1",
    name: "Automated Excel Dashboard For Communications' Operators",
    description:
      "Developed comprehensive automated dashboard for telecommunications sector analysis",
    fullDescription:
      "Created a sophisticated automated dashboard system that analyzes key performance indicators for telecommunications operators. The dashboard provides real-time insights into network performance, customer metrics, revenue analytics, and operational efficiency. Features include automated data refresh, dynamic charts, KPI monitoring, and customizable reporting modules. The system processes large datasets from multiple sources and presents actionable insights through interactive visualizations.",
    technologies: ["Excel", "VBA", "Financial Modeling", "Power Query"],
    languages: ["VBA", "SQL", "DAX"],
    category: "automation",
    industry: "Telecommunications",
    image: "/images/telecom-dashboard.jpg",
    files: [
      {
        id: "1-pdf-en-v1",
        type: "pdf",
        language: "English",
        version: "1.0",
        lastUpdated: "2024-01-15",
        filePath: "/downloads/telecom/telecom-dashboard-report-en-v1.pdf",
        fileName: "Telecom Dashboard Report - English v1.0",
        fileSize: "2.3 MB",
      },
      {
        id: "1-pdf-fa-v1",
        type: "pdf",
        language: "Farsi",
        version: "1.0",
        lastUpdated: "2024-01-18",
        filePath: "/downloads/telecom/telecom-dashboard-report-fa-v1.pdf",
        fileName: "Telecom Dashboard Report - Farsi v1.0",
        fileSize: "2.4 MB",
      },
      {
        id: "1-excel-en-v2",
        type: "excel",
        language: "English",
        version: "2.1",
        lastUpdated: "2024-02-10",
        filePath: "/downloads/telecom/telecom-dashboard-en-v2.1.xlsx",
        fileName: "Telecom Dashboard Template - English v2.1",
        fileSize: "8.7 MB",
      },
      {
        id: "1-excel-fa-v1",
        type: "excel",
        language: "Farsi",
        version: "1.0",
        lastUpdated: "2024-01-20",
        filePath: "/downloads/telecom/telecom-dashboard-fa-v1.xlsx",
        fileName: "Telecom Dashboard Template - Farsi v1.0",
        fileSize: "8.5 MB",
      },
    ],
    socialLinks: {
      linkedin: "https://linkedin.com/in/yourprofile/telecom-project",
      website: "https://yourportfolio.com/telecom-dashboard",
    },
    impact:
      "Reduced reporting time by 85% and improved decision-making efficiency for C-level executives",
    status: "completed",
    duration: "3 months",
    teamSize: 2,
  },
  {
    id: "2",
    name: "Portfolio Management Dashboard for Moshtarak Tadbir Fund",
    description:
      "Built automated Excel and Power BI dashboard for investment fund portfolio management",
    fullDescription:
      "Designed and implemented a comprehensive portfolio management system for a major investment fund. The solution integrates real-time market data, risk analytics, performance attribution, and regulatory reporting. Features include automated portfolio rebalancing alerts, risk exposure monitoring, performance benchmarking against market indices, and detailed fund fact sheet generation. The dashboard supports multiple asset classes and provides both summary and drill-down views for portfolio managers.",
    technologies: [
      "Excel",
      "Power BI",
      "VBA",
      "Financial Analytics",
      "Bloomberg API",
    ],
    languages: ["VBA", "Python", "DAX", "M Query"],
    category: "automation",
    industry: "Asset Management",
    image: "/images/portfolio-dashboard.jpg",
    files: [
      {
        id: "2-pdf-en-v1",
        type: "pdf",
        language: "English",
        version: "1.0",
        lastUpdated: "2024-03-05",
        filePath: "/downloads/portfolio/portfolio-case-study-en-v1.pdf",
        fileName: "Portfolio Management Case Study - English v1.0",
        fileSize: "3.1 MB",
      },
      {
        id: "2-pdf-en-v2",
        type: "pdf",
        language: "English",
        version: "2.0",
        lastUpdated: "2024-03-22",
        filePath: "/downloads/portfolio/portfolio-case-study-en-v2.pdf",
        fileName: "Portfolio Management Case Study - English v2.0",
        fileSize: "3.4 MB",
      },
      {
        id: "2-excel-en-v2",
        type: "excel",
        language: "English",
        version: "2.1",
        lastUpdated: "2024-03-25",
        filePath: "/downloads/portfolio/portfolio-template-en-v2.1.xlsx",
        fileName: "Portfolio Dashboard Template - English v2.1",
        fileSize: "12.3 MB",
      },
      {
        id: "2-powerpoint-en-v1",
        type: "powerpoint",
        language: "English",
        version: "1.0",
        lastUpdated: "2024-03-20",
        filePath: "/downloads/portfolio/portfolio-presentation-en-v1.pptx",
        fileName: "Portfolio Management Presentation - English v1.0",
        fileSize: "15.2 MB",
      },
    ],
    socialLinks: {
      github: "https://github.com/yourusername/portfolio-dashboard",
      linkedin: "https://linkedin.com/in/yourprofile/portfolio-project",
    },
    impact:
      "Improved portfolio monitoring efficiency by 70% and enhanced risk management capabilities",
    status: "completed",
    duration: "4 months",
    teamSize: 3,
  },
  {
    id: "3",
    name: "Setad Portfolio Management Application",
    description:
      "Designed database and backend for one of Iran's largest organizations' portfolio management system",
    fullDescription:
      "Architected and developed a scalable portfolio management system for Setad, one of Iran's largest institutional organizations. The project involved designing a robust database schema, implementing secure backend APIs, and creating data integration pipelines. The system handles multiple asset classes, supports complex organizational hierarchies, and provides comprehensive audit trails. Key features include automated compliance checking, multi-currency support, and integration with external market data providers.",
    technologies: [
      "Database Design",
      "Backend Development",
      "Portfolio Management",
      "API Development",
    ],
    languages: ["Python", "SQL", "JavaScript", "C#"],
    category: "development",
    industry: "Institutional Finance",
    image: "/images/setad-system.jpg",
    files: [
      {
        id: "3-pdf-en-v1",
        type: "pdf",
        language: "English",
        version: "1.0",
        lastUpdated: "2024-04-12",
        filePath: "/downloads/setad/setad-architecture-en-v1.pdf",
        fileName: "Setad System Architecture - English v1.0",
        fileSize: "4.7 MB",
      },
      {
        id: "3-pdf-fa-v1",
        type: "pdf",
        language: "Farsi",
        version: "1.0",
        lastUpdated: "2024-04-15",
        filePath: "/downloads/setad/setad-architecture-fa-v1.pdf",
        fileName: "Setad System Architecture - Farsi v1.0",
        fileSize: "4.9 MB",
      },
      {
        id: "3-word-en-v1",
        type: "word",
        language: "English",
        version: "1.0",
        lastUpdated: "2024-04-18",
        filePath: "/downloads/setad/setad-documentation-en-v1.docx",
        fileName: "Setad Technical Documentation - English v1.0",
        fileSize: "2.8 MB",
      },
    ],
    socialLinks: {
      github: "https://github.com/yourusername/setad-portfolio",
      website: "https://yourportfolio.com/setad-case-study",
    },
    impact:
      "Successfully deployed for organization managing $50B+ in assets with 99.9% uptime",
    status: "completed",
    duration: "8 months",
    teamSize: 6,
  },
  {
    id: "4",
    name: "Barekat Financial Group Evaluation",
    description:
      "Conducted comprehensive financial evaluation of Iran's biggest pharmaceutical sector financial group",
    fullDescription:
      "Led a comprehensive financial due diligence and valuation project for Barekat Financial Group, Iran's largest pharmaceutical financial conglomerate. The analysis included DCF modeling, comparable company analysis, precedent transaction analysis, and sum-of-the-parts valuation. Examined multiple subsidiaries across pharmaceutical manufacturing, distribution, and healthcare services. The project involved extensive industry research, financial statement analysis, and risk assessment including regulatory, operational, and market risks.",
    technologies: [
      "Financial Modeling",
      "Valuation",
      "Industry Analysis",
      "DCF Modeling",
    ],
    languages: ["Excel VBA", "Python", "R"],
    category: "analysis",
    industry: "Pharmaceutical & Healthcare",
    image: "/images/barekat-analysis.jpg",
    files: [
      {
        id: "4-pdf-en-v1",
        type: "pdf",
        language: "English",
        version: "1.0",
        lastUpdated: "2024-05-08",
        filePath: "/downloads/barekat/barekat-valuation-en-v1.pdf",
        fileName: "Barekat Valuation Report - English v1.0",
        fileSize: "6.2 MB",
      },
      {
        id: "4-pdf-fa-v1",
        type: "pdf",
        language: "Farsi",
        version: "1.0",
        lastUpdated: "2024-05-10",
        filePath: "/downloads/barekat/barekat-valuation-fa-v1.pdf",
        fileName: "Barekat Valuation Report - Farsi v1.0",
        fileSize: "6.4 MB",
      },
      {
        id: "4-excel-en-v3",
        type: "excel",
        language: "English",
        version: "3.0",
        lastUpdated: "2024-05-15",
        filePath: "/downloads/barekat/barekat-model-en-v3.xlsx",
        fileName: "Barekat Financial Model - English v3.0",
        fileSize: "18.7 MB",
      },
      {
        id: "4-excel-fa-v2",
        type: "excel",
        language: "Farsi",
        version: "2.0",
        lastUpdated: "2024-05-12",
        filePath: "/downloads/barekat/barekat-model-fa-v2.xlsx",
        fileName: "Barekat Financial Model - Farsi v2.0",
        fileSize: "18.2 MB",
      },
    ],
    socialLinks: {
      linkedin: "https://linkedin.com/in/yourprofile/barekat-analysis",
    },
    impact:
      "Provided strategic insights that influenced $2B+ investment decisions",
    status: "completed",
    duration: "6 months",
    teamSize: 4,
  },
  {
    id: "5",
    name: "Real Estate Investment Trust (REIT) Analysis Platform",
    description:
      "Built comprehensive REIT analysis and comparison platform with automated valuation models",
    fullDescription:
      "Developed an advanced analytics platform for Real Estate Investment Trust analysis and comparison. The platform features automated data collection from multiple sources, FFO and AFFO calculations, dividend sustainability analysis, and property portfolio assessment. Includes sophisticated valuation models using NAREIT benchmarks, peer comparison tools, and risk-adjusted return calculations. The system provides both quantitative metrics and qualitative scoring for investment decision support.",
    technologies: [
      "Python",
      "Machine Learning",
      "Real Estate Analytics",
      "Data Visualization",
    ],
    languages: ["Python", "SQL", "JavaScript", "R"],
    category: "modeling",
    industry: "Real Estate Finance",
    image: "/images/reit-platform.jpg",
    files: [
      {
        id: "5-pdf-en-v2",
        type: "pdf",
        language: "English",
        version: "2.0",
        lastUpdated: "2024-06-20",
        filePath: "/downloads/reit/reit-methodology-en-v2.pdf",
        fileName: "REIT Analysis Methodology - English v2.0",
        fileSize: "3.8 MB",
      },
      {
        id: "5-excel-en-v1",
        type: "excel",
        language: "English",
        version: "1.5",
        lastUpdated: "2024-06-25",
        filePath: "/downloads/reit/reit-tool-en-v1.5.xlsx",
        fileName: "REIT Comparison Tool - English v1.5",
        fileSize: "9.3 MB",
      },
      {
        id: "5-other-en-v1",
        type: "other",
        language: "English",
        version: "1.0",
        lastUpdated: "2024-06-18",
        filePath: "/downloads/reit/reit-dataset-en-v1.csv",
        fileName: "REIT Historical Dataset - English v1.0",
        fileSize: "45.2 MB",
      },
    ],
    socialLinks: {
      github: "https://github.com/yourusername/reit-analyzer",
      website: "https://reit-analyzer-demo.com",
    },
    impact:
      "Accelerated REIT analysis process by 60% and improved investment accuracy",
    status: "ongoing",
    duration: "5 months",
    teamSize: 2,
  },
  {
    id: "6",
    name: "Cryptocurrency Portfolio Optimization Engine",
    description:
      "Machine learning-based portfolio optimization for digital assets with risk management",
    fullDescription:
      "Created an intelligent portfolio optimization engine specifically designed for cryptocurrency investments. The system employs modern portfolio theory adapted for digital assets, incorporating volatility clustering, correlation dynamics, and liquidity constraints. Features include automated rebalancing, risk parity strategies, and market regime detection. The engine processes real-time market data, social sentiment analysis, and on-chain metrics to provide optimal allocation recommendations while managing downside risk.",
    technologies: [
      "Machine Learning",
      "Portfolio Optimization",
      "Blockchain Analytics",
      "Risk Management",
    ],
    languages: ["Python", "Solidity", "JavaScript", "C++"],
    category: "modeling",
    industry: "Cryptocurrency & DeFi",
    image: "/images/crypto-optimizer.jpg",
    files: [
      {
        id: "6-pdf-en-v1",
        type: "pdf",
        language: "English",
        version: "1.0",
        lastUpdated: "2024-07-10",
        filePath: "/downloads/crypto/crypto-whitepaper-en-v1.pdf",
        fileName: "Crypto Optimization Whitepaper - English v1.0",
        fileSize: "5.1 MB",
      },
      {
        id: "6-word-en-v1",
        type: "word",
        language: "English",
        version: "1.2",
        lastUpdated: "2024-07-15",
        filePath: "/downloads/crypto/crypto-guide-en-v1.2.docx",
        fileName: "Crypto Portfolio Guide - English v1.2",
        fileSize: "3.7 MB",
      },
    ],
    socialLinks: {
      github: "https://github.com/yourusername/crypto-portfolio-optimizer",
      website: "https://crypto-optimizer.io",
    },
    impact:
      "Achieved 23% higher risk-adjusted returns compared to equal-weight strategies",
    status: "ongoing",
    duration: "4 months",
    teamSize: 1,
  },
];

export const languageProficiency = {
  language: "English",
  test: "IELTS",
  overall: 7,
  listening: 7.5,
  reading: 7,
  speaking: 7,
  writing: 6.5,
};

export const teachingExperience = {
  position: "Teaching Assistant",
  course: "Management and Entrepreneurship in Biomedical Engineering",
  professor: "Dr. Hamed Azarnoush",
  institution: "Amirkabir University of Technology",
  duration: "2 semesters (2022-2023)",
};
