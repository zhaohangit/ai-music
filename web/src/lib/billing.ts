export interface TrackBillingProjection {
  billingStatus?: string | null;
  estimatedCredits?: number | null;
  settledCredits?: number | null;
}

export type BillingTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface BillingPresentation {
  label: string;
  detail: string;
  tone: BillingTone;
  final: boolean;
}

const credits = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;

/**
 * Present only the owner-scoped ModelCross billing projection returned by
 * MuseFlow. MXAPI points_cost / points_refunded are Provider merchant-cost
 * diagnostics and must never be passed to this function or shown as a user's
 * wallet charge.
 */
export function billingPresentation(
  track: TrackBillingProjection,
): BillingPresentation {
  const estimated = credits(track.estimatedCredits);
  const settled = credits(track.settledCredits);
  const status = String(track.billingStatus ?? "")
    .trim()
    .toLowerCase();

  if (status === "captured") {
    return {
      label: settled === null ? "已结算" : `已结算 ${settled} 积分`,
      detail: "ModelCross 批次账单已完成",
      tone: "success",
      final: true,
    };
  }
  if (status === "partially_captured") {
    return {
      label:
        settled === null
          ? "部分成功，已结算"
          : `部分成功，已结算 ${settled} 积分`,
      detail: "ModelCross 已按成功生成的结果完成结算，其余预留已释放",
      tone: "warning",
      final: true,
    };
  }
  if (status === "released") {
    return {
      label: "积分已释放",
      detail: "ModelCross 已释放本批次预留",
      tone: "success",
      final: true,
    };
  }
  if (status === "refunded") {
    return {
      label: "积分已退回",
      detail: "ModelCross 已完成本批次退款",
      tone: "success",
      final: true,
    };
  }
  if (status === "reserved") {
    return {
      label: estimated === null ? "积分已预留" : `已预留 ${estimated} 积分`,
      detail: "等待本批次生成完成后结算",
      tone: "info",
      final: false,
    };
  }
  if (status === "capture_required" || status === "capturing") {
    return {
      label: "结算处理中",
      detail: "ModelCross 正在结算本批次实际消耗",
      tone: "info",
      final: false,
    };
  }
  if (
    status === "release_required" ||
    status === "releasing" ||
    status === "refunding"
  ) {
    return {
      label: "积分释放中",
      detail: "ModelCross 正在释放或退回本批次积分",
      tone: "warning",
      final: false,
    };
  }
  if (status === "reconcile_required" || status === "manual_review_required") {
    return {
      label: "账单待对账",
      detail: "本批次已进入幂等对账流程，不会采用 Provider 点数替代",
      tone: "danger",
      final: false,
    };
  }
  if (status === "disabled" || status === "not_reserved") {
    return {
      label: "未通过 ModelCross 结算",
      detail: "本地直连可能产生 API 账户费用，请以对应账户用量记录为准",
      tone: "neutral",
      final: true,
    };
  }
  return {
    label: estimated === null ? "账单同步中" : `预计 ${estimated} 积分`,
    detail: "以 ModelCross 最终账单状态为准",
    tone: "neutral",
    final: false,
  };
}
