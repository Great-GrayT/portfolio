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
  location: "United Kingdom",
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
    name: "Polaris",
    description:
      "A specialized web app for financial data processing, providing a financial database including investment funds.",
    fullDescription:
      "Polaris was initially created with the sole purpose of helping investment managers compete with one another by providing a comprehensive and real-time database of mutual fund transactions and portfolios. Similar to Morningstar, it quickly evolved into a complete application in the investment world. Today, it offers a comprehensive financial database for professionals in the capital markets.",
    technologies: ["Excel", "VBA", "Financial Modeling", "Power Query"],
    languages: ["VBA", "SQL", "DAX"],
    category: "finTech",
    industry: "Financial Technology",
    image: "/images/polaris.png",
    files: [],
    socialLinks: {
      website: "https://app.polarislab.ir/",
    },
    impact:
      "The first real-time application for analyzing investment funds, equipped with multiple valuation tools and intrinsic value assessment features for financial experts and investors.",
    status: "completed",
    duration: "12 months",
    teamSize: 3,
  },
  {
    id: "2",
    name: "Automated Scraper Excel Dashboard For Platts Data",
    description:
      "Developed comprehensive automated dashboard for Scraping Excel Dashboard For Platts Data",
    fullDescription:
      "Developed comprehensive automated dashboard for Scraping Excel Dashboard For Platts Data.",
    technologies: ["Excel", "VBA", "Financial Modeling", "Power Query"],
    languages: ["VBA", "SQL", "DAX"],
    category: "automation",
    industry: "Refineries",
    image: "/images/platts.png",
    files: [],
    socialLinks: {},
    impact:
      "Reduced reporting time by 85% and improved decision-making efficiency for C-level executives",
    status: "completed",
    duration: "3 months",
    teamSize: 1,
  },
  {
    id: "3",
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
    files: [],
    socialLinks: {},
    impact:
      "Improved portfolio monitoring efficiency by 70% and enhanced risk management capabilities",
    status: "completed",
    duration: "4 months",
    teamSize: 3,
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
    image: "/images/Pharmaceutical.jpeg",
    files: [
      {
        id: "4-pdf-en-v1",
        type: "pdf",
        language: "Farsi",
        version: "1.0",
        lastUpdated: "2024-07-17",
        filePath: "/downloads/barekat.pdf",
        fileName: "Barekat Valuation Report - pdf - Farsi v1.0",
        fileSize: "2.32 MB",
      },
      {
        id: "4-xlsx-fa-v1",
        type: "excel",
        language: "Farsi",
        version: "1.0",
        lastUpdated: "2024-07-17",
        filePath: "/downloads/barekat.xlsx",
        fileName: "Barekat Valuation Report - Farsi v1.0",
        fileSize: "0.161 MB",
      },
      {
        id: "4-doc-en-v3",
        type: "word",
        language: "Farsi",
        version: "3.0",
        lastUpdated: "2024-07-17",
        filePath: "/downloads/barekat.docx",
        fileName: "Barekat Financial Model - word - English v3.0",
        fileSize: "5.2 MB",
      },
      {
        id: "4-pptx-fa-v2",
        type: "powerpoint",
        language: "Farsi",
        version: "2.0",
        lastUpdated: "2024-07-17",
        filePath: "/downloads/barekat.pptx",
        fileName: "Barekat Financial Model - pptx - Farsi v2.0",
        fileSize: "9.1 MB",
      },
    ],
    socialLinks: {},
    impact:
      "Provided strategic insights that influenced $2B+ investment decisions",
    status: "completed",
    duration: "1 months",
    teamSize: 4,
  },
  {
    id: "5",
    name: "Fundamental Analysis of National Iranian Copper Industries Company",
    description:
      "Fundamental analysis of the National Iranian Copper Industries Company",
    fullDescription:
      "The National Iranian Copper Industries Company, with a capital of 600 trillion rials and a market value of 4,236 trillion rials, is the largest producer of copper cathodes in Iran. Alongside Persian Gulf Petrochemical (Fars) and Mobarakeh Steel (Foolad), it is among the largest companies in the capital market and plays a significant role in the country’s GDP. The company has been listed on the Tehran Stock Exchange since 2006, and its main operations are located in Sarcheshmeh, Sungun, and Shahr-e Babak.",
    technologies: ["Excel"],
    languages: ["VBA"],
    category: "analysis",
    industry: "Copper",
    image: "/images/copper.png",
    files: [
      {
        id: "1-xlsx-fa-v1",
        type: "excel",
        language: "Farsi",
        version: "3.0",
        lastUpdated: "2023-12-29",
        filePath: "/downloads/femeli-final.xlsx",
        fileName: "Fameli model Farsi v1.0",
        fileSize: "16.64 MB",
      },
      {
        id: "1-doc-fa-v1",
        type: "word",
        language: "Farsi",
        version: "1.0",
        lastUpdated: "2023-12-08",
        filePath: "/downloads/femeli.docx",
        fileName: "Fameli Farsi v1.0",
        fileSize: "1.25 MB",
      },
    ],
    socialLinks: {},
    impact:
      "A complete analysis and valuation of the largest copper producer in Iran was conducted. As a result of this valuation report and the subsequent presentations, the company attracted many new clients.",
    status: "completed",
    duration: "1 month",
    teamSize: 4,
  },
  {
    id: "6",
    name: "Fundamental Analysis of the Calcimin Company",
    description: "Fundamental analysis of the Calcimin Company",
    fullDescription:
      "Calcimin Company is a public joint-stock company established in 1964. Initially, the company’s headquarters were located in Zanjan and were relocated to this city in 1991. In 1997, Calcimin was converted into a public joint-stock company, and its shares became tradable on the Tehran Stock Exchange. The company’s main activities include exploration, extraction, and exploitation of mines, as well as the concentration and smelting of mineral materials. In addition, the company seeks to establish mineral processing plants and conduct all commercial activities related to its core business.",
    technologies: ["Excel"],
    languages: ["VBA"],
    category: "analysis",
    industry: "Lead",
    image: "/images/lead.jpg",
    files: [
      {
        id: "1-xlsx-fa-v1",
        type: "excel",
        language: "Farsi",
        version: "1.0",
        lastUpdated: "2024-05-15",
        filePath: "/downloads/fasmin.xlsx",
        fileName: "Fasmin Model Farsi v1.0",
        fileSize: "10.61 MB",
      },
      {
        id: "1-doc-fa-v1",
        type: "word",
        language: "Farsi",
        version: "1.0",
        lastUpdated: "2024-05-15",
        filePath: "/downloads/fasmin.docx",
        fileName: "Fasmin Farsi v1.0",
        fileSize: "0.48 MB",
      },
    ],
    socialLinks: {},
    impact:
      "15% of the investment portfolio’s value was allocated to the metals industry, with a significant portion tied to the lead sector, which is highly dependent on electricity. Through this valuation, it was determined that it would be better to reduce the stock’s share by 4%.",
    status: "completed",
    duration: "1 month",
    teamSize: 4,
  },
  {
    id: "7",
    name: "Fundamental Analysis of the Iran Aluminum Company (IRALCO)",
    description: "Fundamental Analysis of the Iran Aluminum Company (IRALCO)",
    fullDescription:
      "Iran Aluminum Company, also known as IRALCO, was established in 1967 with the participation of Iran, Pakistan, and the United States. Located in the Middle East on a 232-hectare site along the Arak–Tehran road, it is recognized as the first producer of aluminum ingots in Iran. In 1972, the company commenced operations with two production lines and an annual capacity of 45,000 tons. With the increasing domestic demand for aluminum, Arak and other cities in Markazi Province became recognized as the hub of Iran’s aluminum industry. After the Islamic Revolution and the departure of American experts, the company expanded its production lines from two to five by 1991, raising annual capacity to 120,000 tons. In 2002, given the importance of energy consumption in the aluminum industry, construction began on a new 110,000-ton unit with 200 kA technology, meeting environmental standards, adjacent to the existing plant. Today, Iran Aluminum Company operates with two technologies—70 kA and 200 kA—with a combined annual production capacity of 177,500 tons, producing a variety of aluminum ingots in different alloys from molten metal generated in both the new and old smelting workshops.",
    technologies: ["Excel"],
    languages: ["VBA"],
    category: "analysis",
    industry: "Aluminum",
    image: "/images/aluminium.png",
    files: [
      {
        id: "1-xlsx-fa-v1",
        type: "excel",
        language: "Farsi",
        version: "1.0",
        lastUpdated: "2023-06-28",
        filePath: "/downloads/faira.xlsx",
        fileName: "Faira Model Farsi v1.0",
        fileSize: "11.85 MB",
      },
      {
        id: "1-doc-fa-v1",
        type: "word",
        language: "Farsi",
        version: "1.0",
        lastUpdated: "2023-06-28",
        filePath: "/downloads/faira.docx",
        fileName: "Faira Farsi v1.0",
        fileSize: "1.65 MB",
      },
      {
        id: "1-doc-fa-v1",
        type: "pdf",
        language: "Farsi",
        version: "1.0",
        lastUpdated: "2023-06-28",
        filePath: "/downloads/faira.pdf",
        fileName: "Faira Farsi v1.0",
        fileSize: "0.89 MB",
      },
    ],
    socialLinks: {},
    impact:
      "The stock of IRALCO (ticker: FAIRa) was trading at 2,300 rials, and based on this analysis, it was identified as undervalued. Consequently, around 5% of the portfolio was allocated to this stock, which resulted in over 120% return within 140 trading days.",
    status: "completed",
    duration: "1 month",
    teamSize: 4,
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
