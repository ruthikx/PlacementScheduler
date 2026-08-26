"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeededRandom = void 0;
exports.generateDataset = generateDataset;
// Simple, self-contained seedable LCG random number generator
class SeededRandom {
    seed;
    constructor(seedStr) {
        this.seed = this.hash(seedStr);
    }
    hash(str) {
        let h = 1779033703 ^ str.length;
        for (let i = 0; i < str.length; i++) {
            h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
            h = (h << 13) | (h >>> 19);
        }
        return (h >>> 0);
    }
    // Returns [0, 1)
    next() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
    // Returns [min, max] inclusive
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
    // Returns standard normal distribution approximation using Box-Muller transform
    nextNormal(mean, stdDev) {
        let u = 0, v = 0;
        while (u === 0)
            u = this.next();
        while (v === 0)
            v = this.next();
        const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return num * stdDev + mean;
    }
    choose(arr) {
        return arr[this.nextInt(0, arr.length - 1)];
    }
}
exports.SeededRandom = SeededRandom;
const FIRST_NAMES = [
    'Rahul', 'Priya', 'Amit', 'Sneha', 'Rohan', 'Anjali', 'Vikram', 'Divya',
    'Aditya', 'Neha', 'Sanjay', 'Pooja', 'Abhishek', 'Kriti', 'Arjun', 'Ritu',
    'Yash', 'Tanvi', 'Manish', 'Kavita', 'Rajesh', 'Shreya', 'Gaurav', 'Swati',
    'Deepak', 'Aakanksha', 'Vivek', 'Meera', 'Alok', 'Nisha', 'Sunil', 'Kiran',
    'Harish', 'Preeti', 'Pranav', 'Aishwarya', 'Varun', 'Riddhi', 'Kunal', 'Ishita'
];
const LAST_NAMES = [
    'Sharma', 'Verma', 'Gupta', 'Reddy', 'Patel', 'Kumar', 'Singh', 'Joshi',
    'Mehta', 'Nair', 'Chawla', 'Rao', 'Iyer', 'Sen', 'Das', 'Roy', 'Mishra',
    'Pandey', 'Saxena', 'Bose', 'Kapoor', 'Malhotra', 'Bahl', 'Dubey', 'Trivedi',
    'Shah', 'Gokhale', 'Deshmukh', 'Kulkarni', 'Bhat', 'Narayanan', 'Pillai',
    'Choudhury', 'Prasad', 'Yadav', 'Mathur', 'Kohli', 'Gill', 'Vance', 'Shetty'
];
const BRANCHES = ['Computer Science (CS)', 'Electronics (ECE)', 'Electrical (EEE)', 'Mechanical (ME)', 'Civil (CE)', 'Information Technology (IT)'];
function generateDataset(seed) {
    const rng = new SeededRandom(seed);
    // 1. Generate Rooms (20 fixed interview rooms)
    const rooms = [];
    for (let i = 1; i <= 20; i++) {
        rooms.push({
            id: `R-${i}`,
            name: `Room ${i}`
        });
    }
    // 2. Generate 35 Companies
    // 5 Niche companies (High CGPA, few panels, longer duration, high priority)
    // 30 Mass recruiters (Lower CGPA, many panels, short duration, Day 1 / Day 2 preferred)
    const companies = [];
    const nicheNames = ['Google', 'Microsoft', 'Apple', 'OpenAI', 'Jane Street'];
    nicheNames.forEach((name, idx) => {
        companies.push({
            id: `C-${idx + 1}`,
            name: name,
            tier: 'niche',
            cgpaCutoff: parseFloat((8.5 + rng.next() * 0.8).toFixed(2)), // 8.5 to 9.3
            panelsCount: rng.nextInt(1, 2), // 1 or 2 panels
            durationSlots: 2 // 60 mins (2 slots)
        });
    });
    const massNames = [
        'TCS', 'Infosys', 'Wipro', 'Cognizant', 'Accenture', 'Capgemini', 'Tech Mahindra',
        'L&T Infotech', 'HCLTech', 'Mindtree', 'Oracle', 'IBM', 'Deloitte', 'PwC', 'EY',
        'KPMG', 'Amazon (Operations)', 'Flipkart', 'Paytm', 'PhonePe', 'Samsung', 'Intel',
        'Qualcomm', 'Cisco', 'Salesforce', 'Adobe', 'Uber', 'Ola', 'Zomato', 'Swiggy'
    ];
    massNames.forEach((name, idx) => {
        // Determine panels count within the 20-room physical limit.
        let panelsCount = rng.nextInt(2, 3);
        if (idx < 5)
            panelsCount = 4; // Largest recruiters get 20% of campus rooms at once.
        // Day preference: Day 1 (index 0) or Day 2 (index 1) for largest, rest spread
        let preferredDay = undefined;
        if (idx < 8) {
            preferredDay = rng.choose([0, 1]); // Big recruiters prefer early days
        }
        companies.push({
            id: `C-${idx + 6}`,
            name: name,
            tier: 'mass',
            cgpaCutoff: parseFloat((6.0 + rng.next() * 1.5).toFixed(2)), // 6.0 to 7.5
            panelsCount: panelsCount,
            durationSlots: 1, // 30 mins (1 slot)
            preferredDay: preferredDay
        });
    });
    // 3. Generate 800 Students
    // CGPA skewed using normal distribution around 7.5, capped between 5.0 and 10.0
    const students = [];
    for (let i = 1; i <= 800; i++) {
        let cgpa = rng.nextNormal(7.5, 1.1);
        if (cgpa > 10.0)
            cgpa = 10.0;
        if (cgpa < 5.0)
            cgpa = 5.0;
        cgpa = parseFloat(cgpa.toFixed(2));
        const fName = rng.choose(FIRST_NAMES);
        const lName = rng.choose(LAST_NAMES);
        const branch = rng.choose(BRANCHES);
        students.push({
            id: `S-${i}`,
            name: `${fName} ${lName}`,
            cgpa: cgpa,
            branch: branch,
            shortlists: []
        });
    }
    // 4. Generate Shortlists (Power-law-like distribution)
    // Higher CGPA students get on far more shortlists.
    // We iterate through each company and shortlist eligible students.
    companies.forEach((company) => {
        // Filter eligible students
        const eligibleStudents = students.filter(s => s.cgpa >= company.cgpaCutoff);
        if (company.tier === 'niche') {
            // Niche companies shortlist very selectively
            // Sort eligible students by CGPA descending and pick the top tier, with some randomness
            eligibleStudents.sort((a, b) => b.cgpa - a.cgpa);
            // Niche companies shortlist between 15 and 30 students
            const numShortlisted = rng.nextInt(15, 30);
            const candidates = eligibleStudents.slice(0, Math.min(numShortlisted * 2, eligibleStudents.length));
            // Select subset randomly to avoid strict cutoff line
            const selected = [];
            while (selected.length < Math.min(numShortlisted, candidates.length)) {
                const c = rng.choose(candidates);
                if (!selected.includes(c)) {
                    selected.push(c);
                }
            }
            selected.forEach(s => s.shortlists.push(company.id));
        }
        else {
            // Mass recruiters shortlist a large fraction
            // A student's chance of being shortlisted by a mass recruiter is proportional to CGPA
            eligibleStudents.forEach(s => {
                // base probability increases with CGPA:
                // CGPA 6.0 has ~6% chance, CGPA 9.0 has ~14% chance.
                const prob = 0.03 + ((s.cgpa - 5.0) / 5.0) * 0.14;
                if (rng.next() < prob) {
                    s.shortlists.push(company.id);
                }
            });
        }
    });
    // Make sure students' shortlists are sorted (optionally) and cap very busy students to 12 max
    // to avoid physically impossible student schedules (e.g. more interviews than slots in the week)
    students.forEach((s) => {
        if (s.shortlists.length > 12) {
            s.shortlists = s.shortlists.slice(0, 12);
        }
    });
    return { students, companies, rooms };
}
