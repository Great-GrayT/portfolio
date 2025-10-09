"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  GraduationCap,
  Award,
  Calendar,
  School,
  BookOpen,
  ExternalLink,
} from "lucide-react";

export default function EducationSection() {
  const education = [
    {
      degree: "M.Sc. in Finance",
      institution: "Manchester Metropolitan",
      location: "Manchester, UK",
      date: "2024 – 2025",
      description: "Grade: first Class (1:1)",
      icon: <GraduationCap className="h-5 w-5" />,
      additional:
        "Grade: first Class (1:1) - Rank 51+ in World, QS Universities",
    },
    {
      degree: "B.Sc. in Biomedical Engineering (Bioelectric)",
      institution: "Amirkabir University of Technology",
      location: "Tehran, Iran",
      date: "2019 – 2023",
      description:
        "GPA: 3.45 (16.43 / 20), GPA of last 60 units: 3.71 (17.138 / 20)",
      icon: <GraduationCap className="h-5 w-5" />,
      additional: "Rank 1 BioElectrics Department in Iran, Ministry of Science",
    },
    {
      degree: "Economy Minor Course",
      institution: "Management Department, Amirkabir University of Technology",
      location: "Tehran, Iran",
      date: "2021 – 2022",
      description: "GPA: 3.8 (17.82 / 20)",
      icon: <BookOpen className="h-5 w-5" />,
    },
    {
      degree: "High school in Mathematics",
      institution: "Atomic Energy High School",
      location: "Tehran, Iran",
      date: "2016 – 2019",
      description: "GPA: 19.52 / 20",
      icon: <School className="h-5 w-5" />,
      additional: "Rank 1 High School in Iran, Ministry of Science",
    },
  ];

  const certifications = [
    {
      id: "1",
      name: "CFA Level 1 Passed",
      issuer: "CFA Institute",
      date: "2025",
      status: "completed",
      credentialId: "95db74f4-a483-45a1-9a38-63f462bd0776",
      url: "https://credentials.cfainstitute.org/95db74f4-a483-45a1-9a38-63f462bd0776",
    },
    {
      id: "2",
      name: "Bloomberg Market Concepts",
      issuer: "Bloomberg",
      date: "2025",
      status: "completed",
      credentialId: "srbcSSX6bmAxvXgaMj4mWADV",
      url: "https://portal.bloombergforeducation.com/certificates/srbcSSX6bmAxvXgaMj4mWADV",
    },
    {
      id: "3",
      name: "Bloomberg Spreadsheet Analysis",
      issuer: "Bloomberg",
      date: "2025",
      status: "completed",
      credentialId: "rpu4HEP4p2bp9QYBm1cBRUFS",
      url: "https://portal.bloombergforeducation.com/certificates/rpu4HEP4p2bp9QYBm1cBRUFS",
    },
    {
      id: "4",
      name: "Environmental Social Governance",
      issuer: "Bloomberg",
      date: "2025",
      status: "completed",
      credentialId: "qqqz3Ua7cBbc9o1CcrSs9ntN",
      url: "https://portal.bloombergforeducation.com/certificates/qqqz3Ua7cBbc9o1CcrSs9ntN",
    },
    {
      id: "5",
      name: "Finance Accelerator",
      issuer: "Morgan Stanley & UBS",
      date: "2024",
      status: "completed",
      credentialId: "f7d3907c-2efc-47b8-b358-1b8a60b27f6e",
      url: "https://my.amplifyme.com/certificate/f7d3907c-2efc-47b8-b358-1b8a60b27f6e",
    },
    {
      id: "6",
      name: "GRE",
      issuer: "GRE® General Test",
      date: "2023",
      status: "completed",
      credentialId: "c32589da-0d98-4f19-aaf2-d8a368b67298",
      url: "https://achievements.gre.org/c32589da-0d98-4f19-aaf2-d8a368b67298",
    },
  ];

  return (
    <section id="education" className="py-16 md:py-24">
      <div className="container px-4 md:px-6">
        <div className="flex flex-col items-center justify-center text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Education & Certifications
          </h2>
          <Separator className="my-4 w-16 mx-auto" />
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:gap-12 max-w-6xl mx-auto">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <GraduationCap className="h-6 w-6" />
              <h3 className="text-2xl font-bold">Educational Background</h3>
            </div>
            <div className="space-y-6">
              {education.map((item, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                          {item.icon}
                          {item.degree}
                        </CardTitle>
                        <CardDescription>{item.institution}</CardDescription>
                        <CardDescription>{item.location}</CardDescription>
                      </div>
                      <Badge variant="outline" className="font-medium">
                        <Calendar className="mr-1 h-3 w-3" />
                        {item.date}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                    {item.additional && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        {item.additional}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-10">
              <div className="flex items-center gap-2 mb-6">
                <Award className="h-6 w-6" />
                <h3 className="text-2xl font-bold">Teaching Experience</h3>
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle>Teaching assistant</CardTitle>
                      <CardDescription>
                        Department of Biomedical Engineering
                      </CardDescription>
                      <CardDescription>
                        Amirkabir University of Technology, Tehran, Iran
                      </CardDescription>
                    </div>
                    <Badge variant="outline">
                      <Calendar className="mr-1 h-3 w-3" />
                      2022 – 2023
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Course: Management and Entrepreneurship in Biomedical
                    Engineering
                    <br />
                    Professor: Dr.Hamed Azarnoush
                    <br />
                    Duration: 2 semesters
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-6">
              <Award className="h-6 w-6" />
              <h3 className="text-2xl font-bold">Certifications</h3>
            </div>
            <div className="space-y-6">
              {certifications.map((cert) => (
                <Card key={cert.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle>{cert.name}</CardTitle>
                      <Badge variant="outline">
                        <Calendar className="mr-1 h-3 w-3" />
                        {cert.date}
                      </Badge>
                    </div>
                    <CardDescription>{cert.issuer}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <a
                      href={cert.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1 group"
                    >
                      <span>Credential ID: {cert.credentialId}</span>
                      <ExternalLink className="h-3 w-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="mt-10">
            <div className="flex items-center gap-2 mb-6">
              <GraduationCap className="h-6 w-6" />
              <h3 className="text-2xl font-bold">English Proficiency</h3>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>IELTS</CardTitle>
                <CardDescription>
                  Official English language test
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-xl font-bold">Overall</div>
                    <div className="text-2xl font-bold text-primary">7.0</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold">Listening</div>
                    <div className="text-2xl font-bold text-primary">7.5</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold">Reading</div>
                    <div className="text-2xl font-bold text-primary">7.0</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold">Speaking</div>
                    <div className="text-2xl font-bold text-primary">7.0</div>
                  </div>
                  <div className="text-center md:col-span-4">
                    <div className="text-xl font-bold">Writing</div>
                    <div className="text-2xl font-bold text-primary">6.5</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
