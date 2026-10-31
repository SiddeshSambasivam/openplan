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
import { installTooltip } from "@/lib/updates";
import { isWindows } from "@/lib/platform";

interface SaveBeforeUpdateDialogProps {
  open: boolean;
  onCancel: () => void;
  onSaveAndUpdate: () => void;
}

/** Installing restarts the app, so edits not yet on disk are saved first. */
export function SaveBeforeUpdateDialog({
  open,
  onCancel,
  onSaveAndUpdate,
}: SaveBeforeUpdateDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            {installTooltip(isWindows)} Save your changes first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button onClick={onSaveAndUpdate}>Save and update</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
