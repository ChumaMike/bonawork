"use client";

import type { WorkQueueItem } from "@/data/types";
import { RoleHome } from "./role-home";
import { BuyerTask, ReceivingTask, ReleaseTask, SupplierTask } from "./tasks";

/** `/buyer`: reported problems that wait for a work order. */
export function BuyerScreen() {
  return (
    <RoleHome
      forRole="buyer"
      task={(id, { back }) => <BuyerTask key={id} issueId={id} back={back} />}
    />
  );
}

/** `/supplier`: this supplier's orders to acknowledge and to invoice. */
export function SupplierScreen() {
  return (
    <RoleHome
      forRole="supplier"
      task={(id, { back }) => <SupplierTask key={id} issueId={id} back={back} />}
    />
  );
}

/** `/receiving`: orders that wait for a delivery record. Quantities only. */
export function ReceivingScreen() {
  return (
    <RoleHome
      forRole="receiving_officer"
      task={(id, { back }) => <ReceivingTask key={id} issueId={id} back={back} />}
    />
  );
}

/** Orders whose gate is open come first; the rest keep their order, longest wait first. */
function openFirst(items: WorkQueueItem[]): WorkQueueItem[] {
  return [
    ...items.filter((item) => item.blockers.length === 0),
    ...items.filter((item) => item.blockers.length > 0),
  ];
}

/** `/payments`: every order that is not released yet, with its release gate. */
export function PaymentsScreen() {
  return (
    <RoleHome
      forRole="payment_approver"
      inCard
      order={openFirst}
      task={(id, { inCard, open, back }) => (
        <ReleaseTask key={id} issueId={id} inCard={inCard} onOpen={open} back={back} />
      )}
    />
  );
}
