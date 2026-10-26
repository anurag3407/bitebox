"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Link2,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  Share2,
  ShoppingBag,
  Trash2,
  Users,
} from "lucide-react";
import { GroupCartDto, MenuItemDto } from "@startup/contracts";
import { ApiError } from "@startup/api-client";
import { useAuth } from "@/features/auth/auth-context";
import { AddItemInput, GROUP_ORDER_CODE_KEY, useCartStore } from "@/features/cart/cart-store";
import { ItemCustomizerModal } from "@/components/menu/ItemCustomizerModal";
import { Modal } from "@/components/ui/modal";
import { EmptyState, PageSpinner, SafeImage, Spinner, VegMark } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatDateTime, formatRupees } from "@/lib/format";

const STATUS_COPY: Record<GroupCartDto["status"], { label: string; tone: string }> = {
  OPEN: { label: "Collecting dishes", tone: "badge-success" },
  LOCKED: { label: "Ready to checkout", tone: "badge-warn" },
  COMPLETED: { label: "Order placed", tone: "badge-neutral" },
  ABANDONED: { label: "Expired", tone: "badge-danger" },
};

export default function GroupOrderPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const cart = useCartStore();
  const [pending, setPending] = useState<string | null>(null);
  const [customizingItem, setCustomizingItem] = useState<MenuItemDto | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const groupQuery = useQuery({
    queryKey: ["group-cart", code],
    queryFn: () => api.getGroupCart(code),
    // The demo persona loads from localStorage after mount; wait so the first
    // request isn't sent without its token and cached as a 401.
    enabled: auth.isLoaded,
    retry: false,
  });
  const group = groupQuery.data;
  const restaurantQuery = useQuery({
    queryKey: ["restaurant", group?.restaurantSlug],
    queryFn: () => api.getRestaurantBySlug(group!.restaurantSlug),
    enabled: !!group?.restaurantSlug,
  });
  const restaurant = restaurantQuery.data;
  const statusCopy = group ? STATUS_COPY[group.status] : null;

  const myLines = useMemo(
    () => (group ? group.lines.filter((line) => line.participantId === group.viewerId) : []),
    [group]
  );
  const myQuantityOf = (menuItemId: string) =>
    myLines.filter((line) => line.menuItemId === menuItemId).reduce((sum, line) => sum + line.quantity, 0);

  const refresh = (next: GroupCartDto) => queryClient.setQueryData(["group-cart", code], next);

  const run = async (key: string, action: () => Promise<GroupCartDto>) => {
    setPending(key);
    try {
      refresh(await action());
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setPending(null);
    }
  };

  const addSimpleItem = (item: MenuItemDto) =>
    run(`add:${item.id}`, () => api.addGroupCartItem(code, { menuItemId: item.id, quantity: 1 }));

  const shareInvite = async () => {
    const url = `${window.location.origin}/group/${code}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Order with me from ${group?.restaurantName ?? "BiteBox"}`,
          text: "Add your dishes to our group order.",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast("Group invite link copied", "success");
      }
    } catch {
      // share sheet dismissed
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(group?.code ?? code);
      toast("Group code copied", "success");
    } catch {
      toast("Could not copy the code", "error");
    }
  };

  const beginCheckout = async () => {
    if (!group || !restaurant) return;
    setConfirmReplace(false);
    setPending("checkout");
    try {
      const locked = group.status === "OPEN" ? await api.lockGroupCart(code) : group;
      refresh(locked);
      const inputs: AddItemInput[] = locked.lines.map((line) => ({
        restaurantId: locked.restaurantId,
        restaurantName: locked.restaurantName,
        restaurantSlug: locked.restaurantSlug,
        menuItemId: line.menuItemId,
        name: line.name,
        variantId: line.variantId,
        variantName: line.variantName,
        selectedOptions: line.selectedOptions.map((option) => ({ ...option, isAvailable: true })),
        basePricePaise: line.basePricePaise,
        quantity: line.quantity,
        instructions: line.notes,
        imageUrl: line.imageUrl,
        isVeg: line.isVeg,
      }));
      sessionStorage.setItem(GROUP_ORDER_CODE_KEY, code);
      cart.replaceWith(inputs);
      router.push("/checkout");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setPending(null);
    }
  };

  if (!auth.isLoaded || groupQuery.isLoading) return <PageSpinner />;

  if (groupQuery.error) {
    const unauthorized = groupQuery.error instanceof ApiError && groupQuery.error.status === 401;
    return (
      <div className="page py-16">
        <EmptyState
          icon={<Users />}
          title={unauthorized ? "Sign in to join this group order" : "This group order link isn't valid"}
          body={
            unauthorized
              ? "Group orders live in your account so everyone can see the shared bill and their own dishes."
              : "Ask the host for a fresh invite link — group carts expire after 24 hours."
          }
          action={
            unauthorized ? (
              <Link
                href={`/sign-in?redirect_url=${encodeURIComponent(`/group/${code}`)}`}
                className="btn btn-primary"
              >
                Sign in to join
              </Link>
            ) : (
              <Link href="/" className="btn btn-primary">
                Explore restaurants
              </Link>
            )
          }
        />
      </div>
    );
  }

  if (!group || !restaurant) return <PageSpinner />;

  const canAdd = group.status === "OPEN";
  const isTerminal = group.status === "COMPLETED" || group.status === "ABANDONED";

  return (
    <div className="page pb-28 pt-6 sm:pt-8 lg:pb-16">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/restaurants/${group.restaurantSlug}`} className="btn btn-ghost btn-sm -ml-4 gap-1.5">
          <ArrowLeft className="h-4 w-4" /> {group.restaurantName}
        </Link>
        <button onClick={shareInvite} className="btn btn-outline btn-sm gap-1.5">
          <Share2 className="h-4 w-4" /> Invite
        </button>
      </div>

      <header className="mt-5">
        <p className="eyebrow flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> Group order
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="h-page">{group.restaurantName}</h1>
          {statusCopy && <span className={`badge ${statusCopy.tone}`}>{statusCopy.label}</span>}
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          Started by {group.isHost ? "you" : group.hostName} · {group.participantCount} of 12 joined ·{" "}
          {group.itemCount} {group.itemCount === 1 ? "dish" : "dishes"} · closes {formatDateTime(group.expiresAt)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={copyCode} className="badge badge-neutral gap-1.5">
            <Link2 className="h-3 w-3" /> Code {group.code} <Copy className="h-3 w-3" />
          </button>
          <span className="text-xs text-ink-muted">Share the link — everyone pays nothing now, the host checks out once.</span>
        </div>
      </header>

      {group.status === "ABANDONED" && (
        <p className="notice notice-warn mt-6">This cart expired before checkout. Start a new group order from the restaurant.</p>
      )}
      {group.status === "LOCKED" && (
        <p className="notice notice-neutral mt-6">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" /> The host has locked the cart and is checking out. Ask them to reopen it
          if you missed adding something.
        </p>
      )}
      {group.status === "COMPLETED" && (
        <p className="notice notice-success mt-6">
          <Check className="mt-0.5 h-4 w-4 shrink-0" /> This group order was placed.{" "}
          {group.isHost && group.orderId && (
            <Link href={`/orders/${group.orderId}`} className="font-medium underline">
              Track the order
            </Link>
          )}
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="flex flex-wrap gap-2">
            {group.participants.map((participant) => (
              <span key={participant.userId} className="badge badge-neutral gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-semibold">
                  {participant.name.trim().charAt(0).toUpperCase()}
                </span>
                {participant.isHost ? "You" : participant.name.split(" ")[0]}
                {participant.isHost && <Crown className="h-3 w-3" />}
                <span className="text-ink-muted">{participant.itemCount}</span>
              </span>
            ))}
          </div>

          <h2 className="mt-8 text-lg font-semibold text-ink">Add your dishes</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Everything goes on one bill. The host pays at checkout and adds the delivery address.
          </p>

          {restaurant.categories.map((category) => (
            <section key={category.id} className="mt-8">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{category.name}</h3>
              <ul className="rows mt-3">
                {category.items.map((item) => {
                  const mine = myQuantityOf(item.id);
                  const disabled = !canAdd || !item.isAvailable;
                  const customisable = item.variants.length > 0 || item.modifierGroups.length > 0;
                  return (
                    <li key={item.id} className="flex gap-4 py-5">
                      <SafeImage src={item.imageUrl} alt={item.name} className="h-[76px] w-[76px] shrink-0 rounded-2xl object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <VegMark tag={item.dietaryTag} />
                          <p className="truncate font-medium text-ink">{item.name}</p>
                          {mine > 0 && <span className="badge badge-success">You · {mine}</span>}
                        </div>
                        <p className="mt-1 text-sm font-semibold text-ink tabular">{formatRupees(item.pricePaise)}</p>
                        {item.description && (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">{item.description}</p>
                        )}
                      </div>
                      <div className="shrink-0 self-center">
                        {!item.isAvailable ? (
                          <span className="text-xs text-ink-muted">Sold out</span>
                        ) : (
                          <button
                            onClick={() => (customisable ? setCustomizingItem(item) : addSimpleItem(item))}
                            disabled={disabled || pending !== null}
                            className="btn btn-sm border border-line bg-white px-5 text-ink shadow-soft hover:border-ink"
                          >
                            {pending === `add:${item.id}` ? <Spinner /> : customisable ? "Customise" : "Add"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-ink">Shared bill</p>
                <p className="text-xs text-ink-muted">
                  {group.itemCount} {group.itemCount === 1 ? "dish" : "dishes"} from {group.participantCount}{" "}
                  {group.participantCount === 1 ? "person" : "people"}
                </p>
              </div>
              <ShoppingBag className="h-4 w-4 text-ink-muted" />
            </div>

            {group.lines.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-medium text-ink">No dishes yet</p>
                <p className="mt-1 text-xs text-ink-muted">Pick something from the menu — you can edit it until the host checks out.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {group.lines.map((line) => (
                  <li key={line.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {line.quantity} × {line.name}
                          {line.variantName ? <span className="text-ink-muted"> · {line.variantName}</span> : null}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {line.participantId === group.viewerId ? "You" : line.participantName}
                          {line.selectedOptions.length > 0 ? ` · ${line.selectedOptions.map((o) => o.name).join(", ")}` : ""}
                        </p>
                        {line.notes && <p className="mt-1 text-xs italic text-ink-muted">“{line.notes}”</p>}
                      </div>
                      <p className="shrink-0 text-sm font-medium text-ink tabular">{formatRupees(line.lineTotalPaise)}</p>
                    </div>
                    {line.canEdit && (
                      <div className="mt-3 flex items-center justify-between">
                        <div className="stepper h-8">
                          <button
                            aria-label={`Remove one ${line.name}`}
                            disabled={pending !== null}
                            onClick={() =>
                              run(`line:${line.id}`, () => api.updateGroupCartItem(code, line.id, line.quantity - 1))
                            }
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-6 text-center text-sm tabular">{line.quantity}</span>
                          <button
                            aria-label={`Add one ${line.name}`}
                            disabled={pending !== null || line.quantity >= 20}
                            onClick={() =>
                              run(`line:${line.id}`, () => api.updateGroupCartItem(code, line.id, line.quantity + 1))
                            }
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          className="btn btn-ghost btn-sm text-danger"
                          disabled={pending !== null}
                          onClick={() => run(`line:${line.id}`, () => api.removeGroupCartItem(code, line.id))}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-line px-5 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">Items subtotal</span>
                <span className="font-semibold text-ink tabular">{formatRupees(group.subtotalPaise)}</span>
              </div>
              <p className="mt-1 text-xs text-ink-muted">Fees, taxes and any coupon are calculated at checkout.</p>

              {group.isHost ? (
                <div className="mt-4 space-y-2">
                  {!isTerminal && (
                    <button
                      onClick={() => (cart.items.length > 0 ? setConfirmReplace(true) : void beginCheckout())}
                      disabled={pending !== null || group.lines.length === 0}
                      className="btn btn-primary btn-block justify-between"
                    >
                      <span className="flex items-center gap-2">
                        {pending === "checkout" ? <Spinner /> : <Lock className="h-4 w-4" />}
                        {group.status === "OPEN" ? "Lock & checkout" : "Checkout group order"}
                      </span>
                      <span className="tabular">{formatRupees(group.subtotalPaise)}</span>
                    </button>
                  )}
                  {group.status === "LOCKED" && (
                    <button
                      onClick={() => run("reopen", () => api.reopenGroupCart(code))}
                      disabled={pending !== null}
                      className="btn btn-outline btn-block"
                    >
                      <RotateCcw className="h-4 w-4" /> Reopen for more dishes
                    </button>
                  )}
                  {group.status === "COMPLETED" && group.orderId && (
                    <Link href={`/orders/${group.orderId}`} className="btn btn-primary btn-block">
                      Track the order
                    </Link>
                  )}
                </div>
              ) : (
                <p className="mt-4 rounded-2xl bg-subtle px-4 py-3 text-xs leading-relaxed text-ink-muted">
                  {group.isParticipant
                    ? `${group.hostName.split(" ")[0]} will pay the full bill at checkout. You can edit your dishes until then.`
                    : "You're viewing as a guest. Add a dish to join the group."}
                </p>
              )}

              <button onClick={shareInvite} className="btn btn-ghost btn-block mt-2">
                <Share2 className="h-4 w-4" /> Share invite link
              </button>
            </div>
          </div>
        </aside>
      </div>

      {customizingItem && (
        <ItemCustomizerModal
          item={customizingItem}
          isOpen
          onClose={() => setCustomizingItem(null)}
          onConfirm={(customization) =>
            void run(`add:${customizingItem.id}`, () =>
              api.addGroupCartItem(code, {
                menuItemId: customizingItem.id,
                variantId: customization.variantId,
                selectedOptionIds: customization.selectedOptions.map((option) => option.id),
                quantity: customization.quantity,
                notes: customization.instructions,
              })
            )
          }
        />
      )}

      <Modal
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        title="Replace your current cart?"
        description="Checking out the group order clears the dishes already in your personal cart. Anything you added here is included."
        footer={
          <div className="flex gap-3">
            <button onClick={() => setConfirmReplace(false)} className="btn btn-outline flex-1">
              Keep my cart
            </button>
            <button onClick={() => void beginCheckout()} className="btn btn-primary flex-1">
              Use group order
            </button>
          </div>
        }
      >
        <div className="flex items-center gap-3 rounded-2xl bg-subtle px-4 py-3">
          <ShoppingBag className="h-5 w-5 shrink-0 text-ink-muted" />
          <p className="text-sm text-ink-soft">
            Your cart has {cart.items.length} {cart.items.length === 1 ? "dish" : "dishes"} from{" "}
            {cart.restaurantName ?? "another restaurant"}.
          </p>
        </div>
      </Modal>
    </div>
  );
}
