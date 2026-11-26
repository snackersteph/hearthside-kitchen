import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useKitchen } from "@/lib/kitchen/store";
import { DISHES, dishById } from "@/lib/kitchen/data";
import { dateKey, scheduledState } from "@/lib/kitchen/schedule";
import { MEALS, type Meal, type Observation } from "@/lib/kitchen/types";
import { MEAL_LABEL } from "./agents";

interface ObservationDialogProps {
  onClose: () => void;
  /** Fix the form to one resident on their observation-log page. */
  residentId?: string;
  /** When supplied, update this entry and retain its previous version. */
  observation?: Observation;
}

/** Lets staff record or edit how a resident reacted after a specific meal. */
export function ObservationDialog({ onClose, residentId: fixedResidentId, observation }: ObservationDialogProps) {
  const { state, dispatch } = useKitchen();
  const today = dateKey(new Date());
  const [residentId, setResidentId] = useState(observation?.residentId ?? fixedResidentId ?? state.residents[0]?.id ?? "");
  const [serviceDate, setServiceDate] = useState(observation?.serviceDate ?? today);
  const [meal, setMeal] = useState<Meal>(observation?.meal ?? "lunch");
  const [reaction, setReaction] = useState(observation?.reaction ?? "");
  const [severity, setSeverity] = useState<Observation["severity"]>(observation?.severity ?? "concern");
  const offset = Math.round((new Date(`${serviceDate}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000);
  const plannedMain = scheduledState(state, offset).plan[meal];
  const [dishId, setDishId] = useState(observation?.dishId ?? plannedMain);
  const dish = dishById(DISHES.some((d) => d.id === dishId) ? dishId : plannedMain);

  function save() {
    if (!residentId) { toast.error("Choose a resident"); return; }
    if (!reaction.trim()) { toast.error("Describe what you observed"); return; }
    if (observation) {
      dispatch({
        type: "editObservation",
        id: observation.id,
        serviceDate,
        meal,
        dishId: dish.id,
        reaction: reaction.trim(),
        severity,
      });
      toast.success("Observation updated; previous version saved in history");
      onClose();
      return;
    }
    const entry: Observation = {
      id: `obs-${Date.now()}`,
      residentId,
      serviceDate,
      meal,
      dishId: dish.id,
      reaction: reaction.trim(),
      severity,
      status: "open",
      notedAt: Date.now(),
    };
    dispatch({ type: "logObservation", observation: entry });
    toast.success(fixedResidentId ? "Observation added to the resident's log" : "Reaction added to the observation board");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{observation ? "Edit observation" : fixedResidentId ? "Log an observation" : "Log a meal reaction"}</DialogTitle>
          <DialogDescription>
            {observation
              ? "Update the saved details. The previous version will remain available in history."
              : "Record what happened after a resident ate, so the observation board can flag it for follow-up."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="obs-resident">Resident</Label>
            <Select value={residentId} onValueChange={setResidentId} disabled={Boolean(fixedResidentId || observation)}>
              <SelectTrigger id="obs-resident"><SelectValue placeholder="Choose a resident" /></SelectTrigger>
              <SelectContent>
                {state.residents.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} · Room {r.room}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="obs-date">Service date</Label>
              <Input id="obs-date" type="date" max={today} value={serviceDate} onChange={(e) => setServiceDate(e.target.value || today)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="obs-meal">Meal</Label>
              <Select value={meal} onValueChange={(m) => { setMeal(m as Meal); setDishId(scheduledState(state, offset).plan[m as Meal]); }}>
                <SelectTrigger id="obs-meal"><SelectValue /></SelectTrigger>
                <SelectContent>{MEALS.map((m) => <SelectItem key={m} value={m}>{MEAL_LABEL[m]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obs-dish">Dish served</Label>
            <Select value={dish.id} onValueChange={setDishId}>
              <SelectTrigger id="obs-dish"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DISHES.filter((d) => d.meal === meal).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obs-reaction">What happened</Label>
            <Textarea id="obs-reaction" rows={3} value={reaction} onChange={(e) => setReaction(e.target.value)} placeholder="Refused most of the tray, coughing during the meal, nausea reported 30 minutes later…" />
          </div>
          <div className="space-y-1.5">
            <Label>Follow-up needed</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={severity === "concern" ? "default" : "outline"} onClick={() => setSeverity("concern")}>Yes — needs follow-up</Button>
              <Button type="button" size="sm" variant={severity === "note" ? "default" : "outline"} onClick={() => setSeverity("note")}>No — note only</Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{observation ? "Save changes" : fixedResidentId ? "Log observation" : "Add to board"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
