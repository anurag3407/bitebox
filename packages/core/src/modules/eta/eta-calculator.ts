export interface EtaInput {
  prepTimeMinutes: number; // Kitchen estimated food preparation time
  travelToPickupMinutes: number; // Estimated rider travel to restaurant
  dispatchWaitMinutes?: number; // Time until rider is found/assigned (e.g. 2 min)
  lastMileTravelMinutes: number; // Restaurant to customer travel time
  pickupHandoffMinutes?: number; // Handoff at kitchen (e.g. 2 min)
  dropoffHandoffMinutes?: number; // Handoff at door (e.g. 2 min)
  isAlreadyPickedUp?: boolean; // If true, only last mile matters
}

export class EtaCalculator {
  static readonly DEFAULT_DISPATCH_WAIT_MINUTES = 2;
  static readonly DEFAULT_PICKUP_HANDOFF_MINUTES = 2;
  static readonly DEFAULT_DROPOFF_HANDOFF_MINUTES = 2;

  /**
   * Calculates the critical-path ETA in minutes.
   */
  static calculate(input: EtaInput): {
    estimatedMinutes: number;
    minEtaMinutes: number;
    maxEtaMinutes: number;
  } {
    const dispatchWait = input.dispatchWaitMinutes ?? EtaCalculator.DEFAULT_DISPATCH_WAIT_MINUTES;
    const pickupHandoff = input.pickupHandoffMinutes ?? EtaCalculator.DEFAULT_PICKUP_HANDOFF_MINUTES;
    const dropoffHandoff = input.dropoffHandoffMinutes ?? EtaCalculator.DEFAULT_DROPOFF_HANDOFF_MINUTES;

    if (input.isAlreadyPickedUp) {
      // Once picked up, food is already prepared and with rider
      const remainingMinutes = Math.max(1, input.lastMileTravelMinutes + dropoffHandoff);
      return {
        estimatedMinutes: remainingMinutes,
        minEtaMinutes: Math.max(1, remainingMinutes - 3),
        maxEtaMinutes: remainingMinutes + 5,
      };
    }

    // Critical path before pickup:
    // Rider travel to pickup: dispatchWait + travelToPickup
    const riderArrivalAtPickup = dispatchWait + input.travelToPickupMinutes;

    // Kitchen readiness vs Rider arrival overlap
    const pickupHandoffReady = Math.max(input.prepTimeMinutes, riderArrivalAtPickup);
    const pickupCompleteAt = pickupHandoffReady + pickupHandoff;

    // Delivery completion
    const totalMinutes = Math.max(1, pickupCompleteAt + input.lastMileTravelMinutes + dropoffHandoff);

    return {
      estimatedMinutes: totalMinutes,
      minEtaMinutes: Math.max(1, totalMinutes - 5),
      maxEtaMinutes: totalMinutes + 7,
    };
  }
}
