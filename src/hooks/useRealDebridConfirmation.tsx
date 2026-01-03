import { useState, useCallback } from "react";
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

interface ConfirmationState {
  isOpen: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function useRealDebridConfirmation() {
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
          resolve(false);
        },
      });
    });
  }, []);

  const confirmAddToRealDebrid = useCallback(
    (streamName?: string): Promise<boolean> => {
      return confirm(
        "Add to Real-Debrid?",
        streamName
          ? `This will add "${streamName}" to your Real-Debrid cloud. Continue?`
          : "This will add content to your Real-Debrid cloud. Continue?"
      );
    },
    [confirm]
  );

  const ConfirmationDialog = useCallback(
    () => (
      <AlertDialog open={state.isOpen} onOpenChange={(open) => !open && state.onCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.title}</AlertDialogTitle>
            <AlertDialogDescription>{state.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={state.onCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={state.onConfirm}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
    [state]
  );

  return {
    confirm,
    confirmAddToRealDebrid,
    ConfirmationDialog,
  };
}
