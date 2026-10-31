import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ARMED_MS,
  arming,
  deleteLabel,
  deleteLine,
  deleteTitle,
  listedTitles,
  type Arming,
} from "@/lib/planActions";

interface DeletePlansDialogProps {
  /** The titles of the plans to delete. Open while there are any. */
  titles: string[];
  onCancel: () => void;
  onConfirm: () => void;
}

/** Deleting asks twice: the first press arms the button, and only a second
 * press within a few seconds deletes. Focus starts on Cancel. */
export function DeletePlansDialog({ titles, onCancel, onConfirm }: DeletePlansDialogProps) {
  const [step, setStep] = useState<Arming>("ready");
  // The dialog fades out after it closes, still showing what it asked about.
  const asked = useRef(titles);
  if (titles.length > 0) asked.current = titles;
  const count = asked.current.length;
  const { shown, more } = listedTitles(asked.current);

  // One timer while armed. Closing or confirming moves the step on, which
  // clears it.
  useEffect(() => {
    if (step !== "armed") return;
    const timer = setTimeout(() => setStep((now) => arming(now, "expire")), ARMED_MS);
    return () => clearTimeout(timer);
  }, [step]);

  const close = () => {
    setStep((now) => arming(now, "close"));
    onCancel();
  };
  const press = () => {
    const next = arming(step, "press");
    setStep(next === "confirmed" ? "ready" : next);
    if (next === "confirmed") onConfirm();
  };

  return (
    <AlertDialog open={titles.length > 0} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{deleteTitle(count)}</AlertDialogTitle>
          <AlertDialogDescription>{deleteLine(count)}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {shown.map((title, index) => (
            <li key={index} className="truncate">
              {title}
            </li>
          ))}
          {more > 0 && <li className="text-muted-foreground">and {more} more</li>}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={press} aria-live="polite">
            {deleteLabel(step)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
