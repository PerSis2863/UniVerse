// Suggestions for the application / profile forms. Every field that uses them also accepts free
// text, so a missing entry never blocks anyone. The world list of universities is large (~10k),
// so it lives in /public/data and is fetched only when someone opens that field (see
// loadUniversities in ./universities.ts).

const list = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

/** Departments, faculties, schools and fields of study. */
export const DEPARTMENTS = list(`
Accounting
Actuarial Science
Aerospace Engineering
African Studies
Agricultural Engineering
Agriculture
Agronomy
American Studies
Anatomy
Ancient History
Animal Science
Anthropology
Applied Mathematics
Applied Physics
Arabic Studies
Archaeology
Architecture
Art History
Artificial Intelligence
Arts
Asian Studies
Astronomy
Astrophysics
Audiology
Automotive Engineering
Aviation
Banking and Finance
Behavioural Science
Biochemistry
Bioengineering
Bioinformatics
Biology
Biomedical Engineering
Biomedical Science
Biotechnology
Botany
Business Administration
Business Analytics
Business Management
Cell Biology
Ceramics
Chemical Engineering
Chemistry
Chinese Studies
Civil Engineering
Classics
Climate Science
Clinical Psychology
Cognitive Science
Communication Studies
Comparative Literature
Computational Biology
Computer Engineering
Computer Science
Construction Management
Counselling
Creative Writing
Criminology
Culinary Arts
Cultural Studies
Cybersecurity
Dance
Data Science
Dentistry
Dermatology
Design
Development Studies
Digital Media
Drama and Theatre
Early Childhood Education
Earth Sciences
Ecology
Econometrics
Economics
Education
Educational Leadership
Electrical Engineering
Electronics Engineering
Electronics and Communication Engineering
Energy Engineering
Engineering
English Language
English Literature
Entrepreneurship
Environmental Engineering
Environmental Science
Environmental Studies
Epidemiology
Ethnic Studies
European Studies
Event Management
Fashion Design
Film Studies
Finance
Fine Arts
Fisheries Science
Food Science
Food Technology
Forensic Science
Forestry
French
Game Design
Gender Studies
Genetics
Geography
Geology
Geophysics
German
Gerontology
Global Health
Graphic Design
Greek
Health Informatics
Health Sciences
Hebrew Studies
Hindi
History
Horticulture
Hospitality Management
Human Resource Management
Human Rights
Humanities
Immunology
Indigenous Studies
Industrial Design
Industrial Engineering
Information Systems
Information Technology
Instrumentation Engineering
Interior Design
International Business
International Relations
Islamic Studies
Italian
Japanese Studies
Jewellery Design
Journalism
Kinesiology
Korean Studies
Landscape Architecture
Languages and Linguistics
Latin
Latin American Studies
Law
Liberal Arts
Library and Information Science
Linguistics
Logistics and Supply Chain Management
Management
Management Information Systems
Marine Biology
Marine Engineering
Marketing
Mass Communication
Materials Science
Mathematics
Mechanical Engineering
Mechatronics
Media Studies
Medicine
Metallurgical Engineering
Meteorology
Microbiology
Middle Eastern Studies
Midwifery
Mining Engineering
Molecular Biology
Museum Studies
Music
Music Technology
Nanotechnology
Naval Architecture
Neuroscience
Nuclear Engineering
Nursing
Nutrition and Dietetics
Occupational Therapy
Oceanography
Oncology
Operations Research
Ophthalmology
Optometry
Paediatrics
Painting
Paramedic Science
Pathology
Peace and Conflict Studies
Performing Arts
Petroleum Engineering
Pharmacology
Pharmacy
Philosophy
Photography
Physical Education
Physics
Physiology
Physiotherapy
Planetary Science
Plant Science
Political Science
Politics
Portuguese
Product Design
Production Engineering
Psychiatry
Psychology
Public Administration
Public Health
Public Policy
Quantum Science
Radiography
Radiology
Real Estate
Religious Studies
Renewable Energy
Robotics
Russian Studies
Sanskrit
Sculpture
Social Work
Sociology
Software Engineering
Space Science
Spanish
Special Education
Speech and Language Therapy
Sport Science
Statistics
Structural Engineering
Surgery
Sustainability
Teacher Education
Telecommunications Engineering
Textile Engineering
Theology
Tourism Management
Toxicology
Translation and Interpreting
Transport Engineering
Urban Planning
Urdu
Veterinary Science
Visual Arts
Visual Communication
Water Resources Engineering
Web Development
Wildlife Biology
Women's Studies
Zoology
`);

/** Degree programmes / levels, used for the student "Programme" field alongside DEPARTMENTS. */
export const PROGRAMMES = list(`
Bachelor of Arts (BA)
Bachelor of Science (BSc)
Bachelor of Engineering (BEng)
Bachelor of Technology (BTech)
Bachelor of Commerce (BCom)
Bachelor of Business Administration (BBA)
Bachelor of Computer Applications (BCA)
Bachelor of Education (BEd)
Bachelor of Laws (LLB)
Bachelor of Medicine (MBBS)
Bachelor of Fine Arts (BFA)
Bachelor of Architecture (BArch)
Bachelor of Pharmacy (BPharm)
Bachelor of Nursing (BN)
Licence (France)
Licence professionnelle
Bachelor Universitaire de Technologie (BUT)
BTS
Classe préparatoire (CPGE)
Master of Arts (MA)
Master of Science (MSc)
Master of Engineering (MEng)
Master of Technology (MTech)
Master of Business Administration (MBA)
Master of Computer Applications (MCA)
Master of Laws (LLM)
Master of Education (MEd)
Master of Fine Arts (MFA)
Master of Public Health (MPH)
Master (France)
Mastère spécialisé
Diplôme d'ingénieur
Doctor of Philosophy (PhD)
Doctor of Medicine (MD)
Doctorat
Associate Degree
Diploma
Postgraduate Diploma
Certificate
Foundation Year
High school
Secondary school
Vocational training
Exchange programme
`);

export const STUDY_YEARS = list(`
Foundation year
1st year
2nd year
3rd year
4th year
5th year
6th year
Final year
Master's 1st year (M1)
Master's 2nd year (M2)
PhD, 1st year
PhD, 2nd year
PhD, 3rd year or later
Exchange student
Part-time
Postdoctoral
High school
`);

/** Teaching and academic staff positions. */
export const STAFF_POSITIONS = list(`
Professor
Associate Professor
Assistant Professor
Distinguished Professor
Emeritus Professor
Visiting Professor
Adjunct Professor
Clinical Professor
Research Professor
Professor of Practice
Lecturer
Senior Lecturer
Principal Lecturer
Reader
Teaching Fellow
Research Fellow
Senior Research Fellow
Postdoctoral Researcher
Research Assistant
Research Associate
Teaching Assistant
Graduate Teaching Assistant
Tutor
Instructor
Senior Instructor
Lab Instructor
Lab Manager
Maître de conférences
Professeur des universités
ATER
PRAG / PRCE
Chargé de cours
Vacataire
Head of Department
Deputy Head of Department
Programme Director
Programme Coordinator
Course Leader
Module Leader
Dean
Associate Dean
Vice Dean
Provost
Vice-Chancellor
Pro-Vice-Chancellor
President
Vice-President
Rector
Vice-Rector
Principal
Vice-Principal
Director of Studies
Academic Advisor
Student Counsellor
Career Advisor
Librarian
Registrar
Admissions Officer
International Relations Officer
Examinations Officer
IT Administrator
Administrative Staff
School Teacher
Head Teacher
Coach
Trainer
`);

/** Roles at an NGO, company or other organization. */
export const ORG_ROLES = list(`
Founder
Co-founder
Chief Executive Officer (CEO)
Executive Director
Managing Director
President
Vice-President
Chairperson
Board Member
Trustee
Director
Country Director
Regional Director
Programme Director
Programme Manager
Programme Officer
Project Manager
Project Coordinator
Partnerships Manager
Partnerships Officer
Head of Education
Education Officer
Community Manager
Outreach Coordinator
Volunteer Coordinator
Fundraising Manager
Grants Manager
Communications Manager
Marketing Manager
Monitoring and Evaluation Officer
Impact Manager
Research Officer
Policy Advisor
Operations Manager
Finance Manager
HR Manager
Legal Counsel
Recruiter
Talent Acquisition Manager
Corporate Social Responsibility (CSR) Manager
Sustainability Manager
Consultant
Volunteer
Intern
`);

/** Teams within an organization (the "Department" field for organizations). */
export const ORG_DEPARTMENTS = list(`
Executive Office
Programmes
Partnerships
Education
Community
Outreach
Fundraising
Grants
Communications
Marketing
Monitoring and Evaluation
Impact
Research
Policy and Advocacy
Operations
Finance
Human Resources
Talent and Recruitment
Legal
Corporate Social Responsibility
Sustainability
IT
Volunteer Management
`);

/** Subjects someone may teach. */
export const SUBJECTS = [...new Set([...DEPARTMENTS, ...list(`
Algebra
Algorithms
Analog Electronics
Analytical Chemistry
Anatomy and Physiology
Android Development
Applied Statistics
Artificial Neural Networks
Big Data
Blockchain
Business Communication
Business Law
Business Strategy
C Programming
C++
Calculus
Circuit Theory
Cloud Computing
Compiler Design
Computer Architecture
Computer Graphics
Computer Networks
Constitutional Law
Contract Law
Control Systems
Corporate Finance
Cost Accounting
Criminal Law
Cryptography
Data Structures
Database Systems
Deep Learning
Differential Equations
Digital Electronics
Digital Marketing
Digital Signal Processing
Discrete Mathematics
Distributed Systems
DevOps
Embedded Systems
Engineering Drawing
Engineering Mathematics
Ethics
Financial Accounting
Fluid Mechanics
Game Theory
Geometry
Heat Transfer
Human-Computer Interaction
Inorganic Chemistry
Internet of Things
iOS Development
Java
JavaScript
Linear Algebra
Machine Learning
Macroeconomics
Managerial Economics
Manufacturing Processes
Microeconomics
Microprocessors
Mobile App Development
Natural Language Processing
Number Theory
Numerical Methods
Object-Oriented Programming
Operating Systems
Organic Chemistry
Organizational Behaviour
Physical Chemistry
Power Systems
Probability
Project Management
Public Speaking
Python
Quantum Mechanics
R Programming
Real Analysis
Research Methods
Signals and Systems
SQL
Strength of Materials
Strategic Management
Theory of Computation
Thermodynamics
Topology
Trigonometry
UX Design
Web Design
Writing Skills
`)])].sort((a, b) => a.localeCompare(b));
