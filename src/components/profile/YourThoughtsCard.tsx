/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, X, MessageSquareText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ThoughtEntry {
  question: string;
  answer: string;
}

interface YourThoughtsCardProps {
  userId: string;
  thoughts: ThoughtEntry[] | null;
  onUpdate: (thoughts: ThoughtEntry[]) => void;
}

const YourThoughtsCard: React.FC<YourThoughtsCardProps> = ({ userId, thoughts, onUpdate }) => {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editedThoughts, setEditedThoughts] = useState<ThoughtEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  if (!thoughts || thoughts.length === 0) return null;

  const handleEdit = () => {
    setEditedThoughts(thoughts.map(t => ({ ...t })));
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedThoughts([]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ your_thoughts: editedThoughts as any })
        .eq("id", userId);

      if (error) throw error;

      onUpdate(editedThoughts);
      setIsEditing(false);
      toast({ title: "Saved", description: "Your thoughts have been updated." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "Failed to save" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnswerChange = (index: number, value: string) => {
    const updated = [...editedThoughts];
    updated[index] = { ...updated[index], answer: value };
    setEditedThoughts(updated);
  };

  const displayThoughts = isEditing ? editedThoughts : thoughts;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-medium">Your Thoughts</h3>
          </div>
          {isEditing ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                <Check className="h-4 w-4 mr-1" /> {isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={handleEdit}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {displayThoughts.map((thought, index) => (
            <div key={index} className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0 mt-0.5">
                  {index + 1}
                </span>
                <p className="text-sm font-medium text-foreground">{thought.question}</p>
              </div>
              {isEditing ? (
                <div className="ml-7">
                  <Textarea
                    value={thought.answer}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                    className="min-h-[80px] text-sm resize-none"
                  />
                </div>
              ) : (
                <p className="ml-7 text-sm text-muted-foreground whitespace-pre-wrap">
                  {thought.answer || <span className="italic">No answer provided</span>}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default YourThoughtsCard;
