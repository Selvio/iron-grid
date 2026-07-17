import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names, resolving conflicts left-to-right (the shadcn/ui
 * `cn` convention). Lets components accept a `className` override that wins over
 * their defaults without duplicate/contradictory utilities.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T1)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
