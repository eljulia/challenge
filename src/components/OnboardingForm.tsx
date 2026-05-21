/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  User, 
  Globe, 
  Hash, 
  Check, 
  ChevronRight, 
  ChevronLeft, 
  LogOut,
  Mic 
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AccountInfoStep from "./onboarding/AccountInfoStep";
import BriefingStep from "./onboarding/BriefingStep";
import LocationLanguageStep from "./onboarding/LocationLanguageStep";
import IndustryKeywordsStep from "./onboarding/IndustryKeywordsStep";
import TrustedMediaStep from "./onboarding/TrustedMediaStep";


interface ConsentRecord {
  type: 'content_ownership' | 'data_processing';
  version: string;
  acceptedAt: string;
}

interface OnboardingFormProps {
  onSubmit: (data: any) => void;
  isLoading?: boolean;
  preservedFormData?: any;
}

const STEPS = [
  { label: "Overview", icon: User },
  { label: "Briefing", icon: Mic },
  { label: "Location", icon: Globe },
  { label: "Industry", icon: Hash },
  { label: "Confirm", icon: Check },
];

const OnboardingForm: React.FC<OnboardingFormProps> = ({ 
  onSubmit, 
  isLoading = false,
  preservedFormData
}) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  
  const getDefaultFormData = () => ({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    location: [] as string[],
    otherLocation: "",
    preferredLanguage: "",
    otherPreferredLanguage: "",
    secondLanguage: "none",
    otherSecondLanguage: "",
    industries: [] as string[],
    otherIndustry: "",
    ECIndustries: [] as string[],
    keywords: [] as string[],
    customKeywords: [] as string[],
    selectedMedia: [] as string[],
    briefingCompleted: false,
    contentOwnershipConsent: false,
    dataProcessingConsent: false,
    consents: [] as ConsentRecord[]
  });
  
  const [currentStep, setCurrentStep] = useState(() => {
    if (preservedFormData?.currentStep !== undefined) {
      return preservedFormData.currentStep;
    }
    return 0;
  });
  
  // Track the highest step the user has reached
  const [maxVisitedStep, setMaxVisitedStep] = useState(() => {
    if (preservedFormData?.currentStep !== undefined) {
      return preservedFormData.currentStep;
    }
    return 0;
  });
  
  const [formData, setFormData] = useState(() => {
    const defaultData = getDefaultFormData();
    if (preservedFormData) {
      return {
        ...defaultData,
        ...preservedFormData,
        secondLanguage: preservedFormData.secondLanguage || "none",
        contentOwnershipConsent: preservedFormData.contentOwnershipConsent || false,
        dataProcessingConsent: preservedFormData.dataProcessingConsent || false,
        consents: preservedFormData.consents || [],
        selectedMedia: preservedFormData.selectedMedia || []
      };
    }
    return defaultData;
  });
  
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (preservedFormData) {
      const defaultData = getDefaultFormData();
      setFormData(() => ({
        ...defaultData,
        ...preservedFormData,
        secondLanguage: preservedFormData.secondLanguage || "none",
        contentOwnershipConsent: preservedFormData.contentOwnershipConsent || false,
        dataProcessingConsent: preservedFormData.dataProcessingConsent || false,
        consents: preservedFormData.consents || [],
        selectedMedia: preservedFormData.selectedMedia || []
      }));
      if (preservedFormData.currentStep !== undefined) {
        setCurrentStep(preservedFormData.currentStep);
      }
    }
  }, [preservedFormData]);
  
  const validateStep = (step: number) => {
    const errors: Record<string, string> = {};
    
    if (step === 0) {
      return true;
    }

    if (step === 1) {
      if (!formData.briefingCompleted) {
        errors.briefing = "Please complete the briefing before continuing";
      } else {
        const answers: string[] = Array.isArray(formData.briefingAnswers) ? formData.briefingAnswers : [];
        const allFilled = answers.length === 4 && answers.every((a) => (a || "").trim().length > 0);
        if (!allFilled) {
          errors.briefing = "Please fill in all four briefing answers before continuing";
        }
      }
    }
    
    if (step === 2) {
      if (formData.location.length === 0) errors.location = "At least one region is required";
      if (formData.location.includes("Other") && !formData.otherLocation) {
        errors.otherLocation = "Please specify your region";
      }
      if (!formData.preferredLanguage) errors.preferredLanguage = "Preferred language is required";
      if (formData.preferredLanguage === "Other" && !formData.otherPreferredLanguage) {
        errors.otherPreferredLanguage = "Please specify your preferred language";
      }
    }
    
    if (step === 3) {
      if (formData.industries.length === 0) errors.industries = "At least one industry is required";
      if (formData.industries.includes("Other") && !formData.otherIndustry) {
        errors.otherIndustry = "Please specify your industry";
      }
      if (formData.industries.includes("Enterprise & Cloud") && formData.ECIndustries.length === 0) {
        errors.ECIndustries = "Please specify at least one Enterprise & Cloud sub-industry";
      }
    }
    
    if (step === 4) {
      if (!formData.contentOwnershipConsent) {
        errors.contentOwnershipConsent = "You must confirm content ownership";
      }
      if (!formData.dataProcessingConsent) {
        errors.dataProcessingConsent = "You must consent to data processing";
      }
      if (formData.contentOwnershipConsent && formData.dataProcessingConsent) {
        const hasContentOwnership = formData.consents.some(c => c.type === 'content_ownership');
        const hasDataProcessing = formData.consents.some(c => c.type === 'data_processing');
        
        if (!hasContentOwnership || !hasDataProcessing) {
          errors.consents = "Consent records are missing or invalid";
        }
      }
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  };

  const handleTermsNavigation = () => {
    const stateToPreserve = { ...formData, currentStep };
    navigate('/terms', { state: { formData: stateToPreserve } });
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      if (currentStep < 4) {
        const next = currentStep + 1;
        setCurrentStep(next);
        setMaxVisitedStep(prev => Math.max(prev, next));
      } else {
        handleSubmit();
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = () => {
    if (validateStep(currentStep)) {
      const submissionData = {...formData};
      if (submissionData.secondLanguage === "none") {
        submissionData.secondLanguage = "";
      }
      onSubmit(submissionData);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return <AccountInfoStep formData={formData} onChange={handleInputChange} errors={formErrors} />;
      case 1:
        return <BriefingStep formData={formData} onChange={handleInputChange} errors={formErrors} />;
      case 2:
        return <LocationLanguageStep formData={formData} onChange={handleInputChange} errors={formErrors} />;
      case 3:
        return <IndustryKeywordsStep formData={formData} onChange={handleInputChange} errors={formErrors} />;
      case 4:
        return <TrustedMediaStep formData={formData} onChange={handleInputChange} errors={formErrors} onTermsNavigation={handleTermsNavigation} />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-2xl border border-border/50 shadow-lg p-8">
        <div className="flex flex-col items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent"></div>
          <p className="mt-4 text-muted-foreground text-sm">Setting things up…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Card container */}
      <div className="bg-card rounded-2xl border border-border/40 shadow-xl shadow-black/5 overflow-hidden">
        {/* Header */}
        <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Set up your KOL profile
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm sm:text-base">
            Let's personalize your experience. Please tell us about your preferences.
          </p>
        </div>

        {/* Step indicator */}
        <div className="px-6 sm:px-8 pt-6 pb-2">
          <div className="flex items-center gap-1">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              const isClickable = index <= maxVisitedStep;
              
              return (
                <React.Fragment key={step.label}>
                  <button
                    type="button"
                    className={`flex items-center gap-2 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                    onClick={() => {
                      if (isClickable) setCurrentStep(index);
                    }}
                    disabled={!isClickable}
                  >
                    <div
                      className={`
                        flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-all duration-200
                        ${isCompleted 
                          ? 'bg-primary text-primary-foreground' 
                          : isActive 
                            ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' 
                            : 'bg-muted/50 text-muted-foreground'
                        }
                      `}
                    >
                      {isCompleted ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium hidden sm:inline transition-colors ${
                        isActive ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </span>
                  </button>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1 rounded-full transition-colors ${
                        index < currentStep ? 'bg-primary' : 'bg-border'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Step {currentStep + 1} of {STEPS.length}
          </p>
        </div>

        {/* Divider */}
        <div className="mx-6 sm:mx-8 border-t border-border/40" />

        {/* Content */}
        <div className="px-6 sm:px-8 py-6 sm:py-8 min-h-[340px]">
          {renderStepContent()}
        </div>

        {/* Divider */}
        <div className="mx-6 sm:mx-8 border-t border-border/40" />

        {/* Footer actions */}
        <div className="px-6 sm:px-8 py-5 flex justify-between items-center">
          {currentStep === 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="text-muted-foreground hover:text-destructive gap-2"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={prevStep}
              className="text-muted-foreground gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>
          )}
          
          <Button
            onClick={nextStep}
            size="lg"
            className="gap-1.5 px-6 font-semibold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all"
          >
            {currentStep === 4 ? "Complete setup" : "Continue"}
            {currentStep < 4 && <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Footer text */}
      <p className="text-center text-xs text-muted-foreground mt-6">
        © 2026 KOL Platform
      </p>
    </div>
  );
};

export default OnboardingForm;
