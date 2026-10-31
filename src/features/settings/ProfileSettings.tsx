import { useEffect, useState, type FormEvent } from "react";
import { avatarSeed } from "@/lib/avatar";
import type { Identity } from "@/lib/comments";
import { clearAvatar, profileChanged, setAvatar, setProfile } from "@/lib/planBase";
import { isTauri, pickImage } from "@/lib/platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { RoleSettings } from "./RoleSettings";

const HINT = "mt-1 text-xs leading-5 text-muted-foreground";

/** The person's picture, display name, email and role. The picture and
 * the role save as soon as they are picked; the name and email wait for
 * Save. */
export function ProfileSettings({
  identity,
  onIdentityChange,
  revealRole,
}: {
  identity: Identity | null;
  onIdentityChange: (identity: Identity) => void;
  revealRole: boolean;
}) {
  const [name, setName] = useState(identity?.name ?? "");
  const [email, setEmail] = useState(identity?.email ?? "");
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);

  // A new picture leaves what is being typed alone.
  useEffect(() => {
    setName(identity?.name ?? "");
    setEmail(identity?.email ?? "");
  }, [identity?.name, identity?.email]);

  if (!isTauri) {
    return (
      <>
        <h2 className="text-sm font-semibold">Profile</h2>
        <p className="mt-4 text-xs text-muted-foreground">Your profile lives in the desktop app.</p>
      </>
    );
  }

  const edited = () => {
    setSaved(false);
    setFormError(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      onIdentityChange(await setProfile(name, email));
      setSaved(true);
    } catch (error) {
      setFormError(String(error));
    }
  };

  const changePicture = async (change: () => Promise<Identity | null>) => {
    setPictureError(null);
    try {
      const next = await change();
      if (next) onIdentityChange(next);
    } catch (error) {
      setPictureError(String(error));
    }
  };

  const upload = () =>
    changePicture(async () => {
      const path = await pickImage();
      return path ? setAvatar(path) : null;
    });

  return (
    <>
      <h2 className="text-sm font-semibold">Profile</h2>
      <div className="mt-4 flex items-center gap-4">
        <ProfileAvatar
          seed={avatarSeed(identity)}
          picture={identity?.avatar}
          className="size-16"
        />
        <div className="min-w-0">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void upload()}>
              Upload picture
            </Button>
            {identity?.avatar && (
              <Button variant="ghost" size="sm" onClick={() => void changePicture(clearAvatar)}>
                Remove picture
              </Button>
            )}
          </div>
          <p className={HINT}>PNG, JPEG, WebP or GIF, up to 5 MB.</p>
          {pictureError && <p className="mt-1 text-xs text-destructive">{pictureError}</p>}
        </div>
      </div>

      {/* The app checks the email itself, with its own message. */}
      <form noValidate onSubmit={(event) => void save(event)} className="mt-6 space-y-4">
        <div>
          <label htmlFor="profile-name" className="block text-sm text-foreground">
            Display name
          </label>
          <Input
            id="profile-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              edited();
            }}
            className="mt-1.5 h-8"
          />
          <p className={HINT}>Shown on your comments and in each plan's history.</p>
        </div>
        <div>
          <label htmlFor="profile-email" className="block text-sm text-foreground">
            Email
          </label>
          <Input
            id="profile-email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              edited();
            }}
            aria-invalid={formError != null}
            className="mt-1.5 h-8"
          />
          <p className={HINT}>
            Signs your changes and comments. Leave it empty to use your git email.
            <br />
            Comments you left under another email will show as someone else's.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={!profileChanged(identity, name, email)}>
            Save
          </Button>
          {saved && (
            <span className="animate-in text-xs text-muted-foreground fade-in">Saved.</span>
          )}
        </div>
        {formError && <p className="text-xs text-destructive">{formError}</p>}
      </form>

      <RoleSettings reveal={revealRole} />
    </>
  );
}
