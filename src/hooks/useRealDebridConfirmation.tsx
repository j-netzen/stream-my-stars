import { useState, useCallback, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const SKIP_CONFIRMATION_KEY = "rd_skip_confirmation";

interface ConfirmationState {
  isOpen: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function useRealDebridConfirmation() {
  const [skipConfirmation, setSkipConfirmation] = useState(() => {
    return localStorage.getItem(SKIP_CONFIRMATION_KEY) === "true";
  });
  const [tempSkip, setTempSkip] = useState(false);

  const [state, setState] = useState<ConfirmationState>({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => {},
    onCancel: () => {},
  });

  const confirm = useCallback((title: string, description: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        title,
        description,
        onConfirm: () => {
          setState((prev) => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setState((prev) => ({ ...prev, isOpen: false }));
          setTempSkip(false);
          resolve(false);
        },
      });
    });
  }, []);

  const confirmAddToRealDebrid = useCallback(
    (streamName?: string): Promise<boolean> => {
      if (skipConfirmation) {
        return Promise.resolve(true);
      }
      return confirm(
        "Add to Real-Debrid?",
        streamName
          ? `This will add "${streamName}" to your Real-Debrid cloud. Continue?`
          : "This will add content to your Real-Debrid cloud. Continue?"
      );
    },
    [confirm, skipConfirmation]
  );

  const handleConfirm = useCallback(() => {
    if (tempSkip) {
      localStorage.setItem(SKIP_CONFIRMATION_KEY, "true");
      setSkipConfirmation(true);
    }
    setTempSkip(false);
    state.onConfirm();
  }, [tempSkip, state]);

  const ConfirmationDialog = useCallback(
    () => (
      <AlertDialog open={state.isOpen} onOpenChange={(open) => !open && state.onCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.title}</AlertDialogTitle>
            <AlertDialogDescription>{state.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="skip-confirmation"
              checked={tempSkip}
              onCheckedChange={(checked) => setTempSkip(checked === true)}
            />
            <Label htmlFor="skip-confirmation" className="text-sm text-muted-foreground cursor-pointer">
              Don't ask me again
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={state.onCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
    [state, tempSkip, handleConfirm]
  );

  const resetSkipPreference = useCallback(() => {
    localStorage.removeItem(SKIP_CONFIRMATION_KEY);
    setSkipConfirmation(false);
  }, []);

  return {
    confirm,
    confirmAddToRealDebrid,
    ConfirmationDialog,
    skipConfirmation,
    resetSkipPreference,
  };
}
