import { OrderDetailDto } from "@startup/contracts";
import { DomainError } from "@startup/core";
import { RestaurantRepository } from "@startup/database";

export async function orderGeo(order: OrderDetailDto) {
  const restaurant = await RestaurantRepository.findById(order.restaurant.id);
  if (!restaurant) throw new DomainError("NOT_FOUND", "Restaurant not found");
  return { restaurantLocation: { latitude: restaurant.latitude, longitude: restaurant.longitude } };
}
