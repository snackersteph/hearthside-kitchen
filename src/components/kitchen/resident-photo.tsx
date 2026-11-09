import photo1 from "@/assets/resident-R001.jpg";
import photo2 from "@/assets/resident-R002.jpg";
import photo3 from "@/assets/resident-R003.jpg";
import photo4 from "@/assets/resident-R004.jpg";
import photo5 from "@/assets/resident-R005.jpg";
import photo6 from "@/assets/resident-R006.jpg";
import photo7 from "@/assets/resident-R007.jpg";
import photo8 from "@/assets/resident-R008.jpg";
import photo9 from "@/assets/resident-R009.jpg";
import photo10 from "@/assets/resident-R010.jpg";
import photo11 from "@/assets/resident-R011.jpg";
import photo12 from "@/assets/resident-R012.jpg";
import photo13 from "@/assets/resident-R013.jpg";
import photo14 from "@/assets/resident-R014.jpg";
import photo15 from "@/assets/resident-R015.jpg";
import type { Resident } from "@/lib/kitchen/types";
import { cn } from "@/lib/utils";

const photos: Record<string, string> = {
  R001: photo1,
  R002: photo2,
  R003: photo3,
  R004: photo4,
  R005: photo5,
  R006: photo6,
  R007: photo7,
  R008: photo8,
  R009: photo9,
  R010: photo10,
  R011: photo11,
  R012: photo12,
  R013: photo13,
  R014: photo14,
  R015: photo15
};

export function ResidentPhoto({ resident, large = false }: { resident: Resident; large?: boolean }) {
  const src = photos[resident.id];
  const classes = cn("shrink-0 rounded-lg border object-cover", large ? "h-32 w-32 sm:h-40 sm:w-40" : "h-13.75 w-13.75");
  if (!src) return <span aria-label={`${resident.name} profile`} className={cn(classes, "flex items-center justify-center bg-secondary font-semibold text-secondary-foreground")}>{resident.name.split(/\s+/).map((word) => word[0]).join("")}</span>;
  return <img src={src} alt={`${resident.name} profile photo`} width={320} height={320} loading={large ? "eager" : "lazy"} className={classes} />;
}
