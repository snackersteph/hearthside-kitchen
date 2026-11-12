import { Link, useSearch } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const BOARD_IDS = ["current-service-week", "purchasing-service-week", "planning-service-week"];
export function boardReturnSearch(search: Record<string, unknown>): { fromBoard?: string } {
  return typeof search["fromBoard"] === "string" && BOARD_IDS.includes(search["fromBoard"])
    ? { fromBoard: search["fromBoard"] } : {};
}
export function BoardReturn() {
  const search = useSearch({ strict: false });
  const { fromBoard } = boardReturnSearch(search);
  if (!fromBoard) return null;
  return <Button asChild variant="ghost" size="sm" className="mb-5"><Link to="/" hash={fromBoard}><ArrowLeft />Back to service weeks</Link></Button>;
}