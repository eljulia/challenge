
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";

export function useSuggestedKeywords(watchFunction: any) {
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
  // Ensure selectedIndustries is always an array
  const selectedIndustries = Array.isArray(watchFunction("industries")) ? watchFunction("industries") : [];

  useEffect(() => {
    // Map of industry-specific keywords with expanded suggestions
    const keywordsByIndustry: Record<string, string[]> = {
      "Aviation": ["Aircraft", "Airlines", "Airports", "Aerospace", "Flight", "Aviation Technology", "Air Traffic Control", "Avionics", "Business Jets", "Commercial Aviation", "Defense Aviation", "Ground Operations", "Maintenance", "Safety Protocols", "Security"],
      "Cruise": ["Hospitality", "Maritime", "Ships", "Tourism", "Travel", "Cruise Lines", "Destinations", "Entertainment", "Luxury Travel", "Passenger Experience", "Port Operations", "Safety Measures", "Shore Excursions", "Sustainability", "Vessel Management"],
      "Data Center Operators": ["Colocation", "Computing", "Infrastructure", "Operations", "Servers", "Backup Systems", "Cloud Services", "Cooling Solutions", "Data Management", "Energy Efficiency", "Facility Management", "Network Architecture", "Power Distribution", "Redundancy", "Storage Solutions"],
      "Data Center Providers": ["Architecture", "Colocation", "Facility", "Infrastructure", "Storage", "Capacity Planning", "Cloud Integration", "Cooling Technology", "Disaster Recovery", "Edge Computing", "Hyperconvergence", "Managed Services", "Power Management", "Security Solutions", "Virtualization"],
      "Energy": ["Oil & Gas", "Power Generation", "Renewable", "Sustainability", "Utilities", "Biofuels", "Carbon Capture", "Distribution Networks", "Efficiency", "Grid Management", "Hydrocarbons", "Nuclear Power", "Smart Grid", "Solar Power", "Wind Energy"],
      "Government": ["Civic", "Compliance", "Policy", "Public Sector", "Regulation", "Cybersecurity", "Defense", "Digital Transformation", "Federal Agencies", "International Relations", "National Security", "Public Infrastructure", "Regulatory Frameworks", "Smart Cities", "State Administration"],
      "Hyperscalers": ["Cloud Computing", "Data Centers", "Global Reach", "Infrastructure", "Scalability", "AI Integration", "Big Data", "Content Delivery", "Distributed Systems", "High Performance Computing", "Platform Services", "Resource Management", "Software Solutions", "Storage Architecture", "Virtualization"],
      "Internet Service Providers": ["Broadband", "Connectivity", "Internet", "Network", "Telecommunications", "Bandwidth Management", "Customer Service", "Data Plans", "Fiber Optics", "Infrastructure Development", "Last-mile Delivery", "Network Reliability", "Pricing Models", "Rural Coverage", "Service Quality"],
      "Maritime": ["Logistics", "Naval", "Ports", "Shipping", "Vessels", "Container Management", "Crew Operations", "Fleet Management", "Global Trade", "Harbor Operations", "Navigation Systems", "Offshore Operations", "Safety Standards", "Supply Chain", "Trade Routes"],
      "Media & Broadcasters": ["Broadcasting", "Content Creation", "Entertainment", "Production", "Streaming", "Advertising", "Digital Distribution", "Live Events", "Multimedia Platforms", "Network Operations", "Programming", "Ratings", "Social Media Integration", "Technology Innovation", "Viewer Analytics"],
      "Mining": ["Extraction", "Minerals", "Natural Resources", "Operations", "Sustainability", "Automation", "Exploration", "Heavy Equipment", "Land Reclamation", "Ore Processing", "Process Optimization", "Resource Management", "Safety Standards", "Site Development", "Sustainable Practices"],
      "MNO": ["Connectivity", "Mobile", "Network", "Telecommunications", "Wireless", "5G Deployment", "Business Services", "Consumer Plans", "Coverage Expansion", "Data Services", "Infrastructure Investment", "Network Reliability", "Roaming", "Spectrum Management", "Voice Services"],
      "Sports & Organizations": ["Athletics", "Events", "Leagues", "Teams", "Tournaments", "Brand Management", "Community Outreach", "Digital Engagement", "Facilities", "Fan Experience", "International Competition", "Marketing", "Performance Analytics", "Sponsorships", "Training Programs"],
      "System Integrators": ["Architecture", "Consulting", "Implementation", "Solutions", "Technology", "Application Development", "Business Process", "Cloud Migration", "Custom Solutions", "Enterprise Systems", "Industry Knowledge", "Process Optimization", "Project Management", "Security Implementation", "Software Integration"],
      "Telco": ["Communication", "Connectivity", "Network", "Services", "Telecommunications", "Broadband Solutions", "Business Services", "Digital Transformation", "Fiber Networks", "Infrastructure Development", "Internet Services", "Managed Services", "Mobile Integration", "Unified Communications", "VoIP"],
      "Utilities": ["Distribution", "Energy", "Infrastructure", "Services", "Sustainability", "Asset Management", "Customer Service", "Demand Response", "Grid Modernization", "Operational Efficiency", "Power Generation", "Resource Conservation", "Smart Metering", "Transmission", "Water Management"],
      "Enterprise & Cloud": ["APIs", "Cloud Computing", "Digital Transformation", "Enterprise Software", "SaaS", "Application Modernization", "Business Continuity", "Containerization", "DevOps", "Hybrid Cloud", "Microservices", "Multi-cloud Strategy", "Orchestration", "Platform Management", "Security Solutions"],
      "Other": ["Business", "Innovation", "Services", "Solutions", "Technology", "Analytics", "Consulting", "Customer Experience", "Digital Strategy", "Emerging Technology", "Market Research", "Optimization", "Process Improvement", "Strategic Planning", "Workforce Solutions"]
    };

    // Ensure we have an array before using flatMap
    if (!Array.isArray(selectedIndustries) || selectedIndustries.length === 0) {
      setSuggestedKeywords([]);
      return;
    }

    try {
      // Get all keywords from selected industries
      const allKeywords = selectedIndustries.flatMap(industry => 
        keywordsByIndustry[industry] || []
      );

      // Get unique keywords
      const uniqueKeywords = [...new Set(allKeywords)];
      
      // Sort keywords alphabetically - explicitly cast to string[] to fix the typing issue
      const sortedKeywords = [...uniqueKeywords].sort((a: string, b: string) => a.localeCompare(b)) as string[];
      
      setSuggestedKeywords(sortedKeywords);
    } catch (error) {
      console.error("Error processing keywords:", error);
      setSuggestedKeywords([]);
    }
  }, [selectedIndustries]);

  return suggestedKeywords;
}
