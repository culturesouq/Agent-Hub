/**
 * Canonical archetypes + role taxonomy — single source of truth.
 *
 * Patent Claim 14 enumerates 9 archetypes; Claim 15 enumerates 188 roles
 * across 11 domain clusters. Both lists used to live in TWO places:
 *   - artifacts/opsoul-api/src/routes/chat.ts (BIRTH_ARCHETYPES + BIRTH_ROLES)
 *   - artifacts/opsoul-api/src/routes/operators.ts (VALID_ARCHETYPES + VALID_ROLES)
 *
 * Byte-for-byte duplicates that could drift independently. Phase 1A patent
 * draft will lock the archetype names — DO NOT rename here until that
 * decision is final. This commit only deduplicates.
 *
 * Owner decision D-1 (Phase 1B): the code names (Executor, Advisor, Expert,
 * Connector, Creator, Guardian, Builder, Catalyst, Analyst) are the
 * authoritative set; the patent claim text is being rewritten to match
 * (Phase 1A scope, separate workstream). If that decision flips, this file
 * is the single place to update.
 */

export const ARCHETYPES = [
  'Executor',
  'Advisor',
  'Expert',
  'Connector',
  'Creator',
  'Guardian',
  'Builder',
  'Catalyst',
  'Analyst',
] as const;

export type Archetype = (typeof ARCHETYPES)[number];

export const ROLES = [
  // Strategy & Leadership
  'Strategist', 'Chief of Staff', 'General Manager', 'Team Lead', 'Department Head', 'Portfolio Manager', 'Change Manager',
  // Research & Knowledge
  'Researcher', 'Research Director', 'Domain Expert', 'Knowledge Manager', 'Information Scientist', 'Librarian', 'Curator', 'Archivist', 'Scientific Advisor', 'Technical Advisor', 'Innovation Advisor',
  // Project & Program
  'Project Manager', 'Program Manager', 'Operations Manager', 'Quality Manager', 'Process Engineer', 'Quality Assurance Advisor',
  // Business & Analysis
  'Business Analyst', 'Data Analyst', 'Pricing Analyst', 'Strategic Analyst', 'Market Research Analyst',
  // Finance & Accounting
  'Financial Advisor', 'Investment Advisor', 'Wealth Manager', 'Tax Advisor', 'Audit Advisor', 'Treasury Advisor', 'Controller', 'Accounts Advisor', 'Insurance Advisor',
  // Sales & Marketing
  'Sales Advisor', 'Marketing Strategist', 'Brand Manager', 'Product Manager', 'Growth Strategist', 'Customer Success Manager', 'Channel Manager', 'Partnership Advisor', 'Content Strategist', 'Social Media Strategist', 'SEO Advisor',
  // Operations & Supply
  'Procurement Advisor', 'Supply Chain Advisor', 'Logistics Advisor', 'Inventory Manager', 'Vendor Manager', 'Manufacturing Advisor', 'Maritime Advisor', 'Aviation Advisor', 'Transportation Advisor',
  // Government, Policy & Diplomacy
  'Policy Analyst', 'Compliance Officer', 'Regulatory Advisor', 'Governance Advisor', 'Public Affairs Advisor', 'Public Sector Advisor', 'Diplomat', 'Trade Advisor', 'Customs Advisor', 'Foreign Affairs Advisor', 'Defense Advisor', 'Public Procurement Advisor', 'Tax Policy Advisor',
  // Communications & Media
  'Communications Officer', 'Public Relations Advisor', 'Spokesperson', 'Media Advisor', 'Speechwriter', 'Journalist', 'Editor', 'Copywriter', 'Content Writer', 'Crisis Communications Advisor',
  // Intelligence & Security
  'Intelligence Analyst', 'Risk Officer', 'Risk Analyst', 'Security Advisor', 'Cybersecurity Advisor', 'Investigations Officer', 'Forensic Analyst', 'Threat Intelligence Advisor',
  // Legal
  'Legal Reviewer', 'Contracts Advisor', 'Intellectual Property Advisor', 'Compliance Counsel', 'Privacy Advisor', 'Mediator', 'Arbitrator', 'Paralegal Advisor',
  // People & Culture
  'HR Advisor', 'Talent Advisor', 'Recruitment Advisor', 'Compensation Advisor', 'Benefits Advisor', 'Organizational Development Advisor', 'Diversity Advisor', 'Employee Relations Advisor',
  // Coaching
  'Coach', 'Wellness Coach', 'Leadership Coach', 'Career Coach', 'Performance Coach', 'Founder Coach', 'Pitch Coach', 'Mental Health Coach',
  // Education & Training
  'Educator', 'Tutor', 'Faculty Advisor', 'Academic Advisor', 'Training Advisor', 'Curriculum Designer', 'Instructional Designer', 'Education Policy Advisor',
  // Technology & Engineering
  'Technology Advisor', 'Software Architect', 'Solutions Architect', 'Systems Analyst', 'Data Engineer', 'DevOps Advisor', 'Cloud Advisor', 'Database Advisor', 'Network Advisor', 'AI Advisor', 'IT Advisor', 'Platform Advisor', 'Frontend Advisor', 'Backend Advisor', 'Mobile Advisor',
  // Design & Creative
  'Creative Director', 'Art Director', 'Product Designer', 'UX Designer', 'UI Designer', 'Brand Designer', 'Visual Designer', 'Service Designer', 'Design Researcher', 'Storyteller', 'Game Designer', 'Industrial Designer',
  // Health & Wellbeing
  'Health Advisor', 'Medical Advisor', 'Nutritional Advisor', 'Wellness Strategist', 'Public Health Advisor', 'Healthcare Policy Advisor', 'Pharmaceutical Advisor',
  // Sustainability & Environment
  'Sustainability Advisor', 'Environmental Advisor', 'Climate Advisor', 'ESG Advisor', 'Energy Advisor', 'Renewable Energy Advisor', 'Water Advisor', 'Conservation Advisor',
  // Agriculture & Food
  'Agricultural Advisor', 'Food Security Advisor', 'Aquaculture Advisor',
  // Real Estate & Built Environment
  'Real Estate Advisor', 'Property Manager', 'Construction Advisor', 'Architecture Advisor', 'Urban Planner', 'Facilities Advisor', 'Civil Engineering Advisor',
  // Entrepreneurship & Venture
  'Startup Advisor', 'Venture Advisor', 'Incubator Advisor', 'Fundraising Advisor', 'Exit Strategy Advisor',
  // Culture, Arts & Tourism
  'Cultural Affairs Advisor', 'Heritage Advisor', 'Museum Advisor', 'Performing Arts Advisor', 'Music Advisor', 'Film Advisor', 'Literary Advisor', 'Tourism Advisor',
  // Executive Support
  'Executive Assistant', 'Account Advisor',
] as const;

export type Role = (typeof ROLES)[number];
