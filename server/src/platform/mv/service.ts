import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { validateAudioUploadFile } from "../audio-upload.js";
import {
  normalizeProject,
  publicProject,
  requireEditable,
  markChanged,
  renderFingerprint,
  retime,
  editShots,
  selectVersion,
  splitShot,
  saveShotVersion,
  generationDuration,
} from "./editing.js";
import { estimateShot, PRICING_SOURCE, PRICING_NOTE } from "./pricing.js";
import { ValidationError } from "../../errors.js";
import type { DatabaseClient } from "../database.js";
import type { PlatformConfig } from "../config.js";
import { assertModelCrossIdempotencyKey } from "../idempotency.js";
import {
  PlatformRepository,
  ResourceNotFoundError,
  ResourceStateConflictError,
  IdempotencyConflictError,
} from "../repository.js";
import { downloadAssetToFile, type ObjectStorage } from "../object-storage.js";
import type { AuthenticatedSession } from "../types.js";
import type { SunoActionsService } from "../suno-actions-service.js";
import {
  VIDEO_MODELS,
  createStoryboard,
  validateSettings,
  videoModel,
  videoPayload,
} from "./catalog.js";
import { alignmentCaptions, parseSrt, MvMedia } from "./media.js";
import { ownerStoragePrefix } from "../music-service.js";
import { MvProvider } from "./provider.js";
import type { MvCatalog, MvProject, MvShot, MvQuote, MvStem } from "./types.js";
interface StoredProject extends MvProject {
  renderWhenReady?: boolean;
}
export class MvService {
  private timer: NodeJS.Timeout | null = null;
  private active: Promise<void> | null = null;
  private renderActive: Promise<void> | null = null;
  private rendererReady = false;
  private rendererCheckedUntil = 0;
  constructor(
    private config: PlatformConfig,
    private repository: PlatformRepository,
    private storage: ObjectStorage,
    private provider: MvProvider,
    private media: MvMedia,
    private sunoActions: SunoActionsService,
  ) {}
  async catalog(admin = false): Promise<MvCatalog> {
    if (Date.now() > this.rendererCheckedUntil) {
      this.rendererReady = await this.media.ready();
      this.rendererCheckedUntil = Date.now() + 30000;
    }
    const configured = await this.provider.configured();
    const probe = configured ? await this.provider.probe() : null;
    const authenticated = probe?.authenticated ?? false;
    return {
      models: VIDEO_MODELS.map((m) => ({
        ...m,
        availability: authenticated ? "unverified" : "unavailable",
        verified: false,
        availabilityReason: authenticated
          ? "接口参数已核对；尚未逐模型验证当前账户的真实生成"
          : "请检查 API 账户鉴权或服务状态",
      })),
      rendererReady: this.rendererReady,
      canGenerate: authenticated && this.rendererReady,
      reason: !configured
        ? "服务端尚未启用视频生成"
        : !authenticated
          ? (probe?.error ?? "视频账户验证失败")
          : !this.rendererReady
            ? "FFmpeg 合成服务未就绪"
            : null,
      audioReferenceReady: await this.storageReady(),
      billingMode: configured ? "provider-direct" : "unavailable",
      canLinkUncertain: admin,
      providerCheckedAt: probe?.checkedAt,
      providerAuthenticated: authenticated,
      pricingNote: PRICING_NOTE,
    };
  }
  private storageReady(): Promise<boolean> {
    return this.storage.providerAccessible
      ? this.storage.providerAccessible()
      : Promise.resolve(this.config.storage.providerUploadUrlsReachable);
  }
  private get db() {
    return this.repository.database;
  }
  async counts(owner: string): Promise<{ active: number; attention: number }> {
    const r = await this.db.query(
      "SELECT COUNT(*) FILTER(WHERE status IN ('generating','assembling'))::int AS active,COUNT(*) FILTER(WHERE status IN ('failed','paused'))::int AS attention FROM mv_projects WHERE owner_subject=$1 AND archived_at IS NULL AND deleted_at IS NULL",
      [owner],
    );
    return r.rows[0] as { active: number; attention: number };
  }
  async list(
    owner: string,
    archived = false,
    limit = 100,
    offset = 0,
  ): Promise<MvProject[]> {
    const r = await this.db.query(
      "SELECT data,(archived_at IS NOT NULL) AS archived,pause_requested FROM mv_projects WHERE owner_subject=$1 AND deleted_at IS NULL AND (archived_at IS NOT NULL)=$2 ORDER BY created_at DESC LIMIT $3 OFFSET $4",
      [owner, archived, Math.min(100, Math.max(1, limit)), Math.max(0, offset)],
    );
    return r.rows.map((r) =>
      this.public({
        ...r.data,
        archived: r.archived,
        pauseRequested: r.pause_requested,
      }),
    );
  }
  async get(owner: string, id: string): Promise<StoredProject> {
    const r = await this.db.query(
      "SELECT data,(archived_at IS NOT NULL) AS archived,pause_requested FROM mv_projects WHERE owner_subject=$1 AND id=$2 AND deleted_at IS NULL",
      [owner, id],
    );
    if (!r.rows[0]) throw new ResourceNotFoundError("MV 不存在");
    return normalizeProject({
      ...r.rows[0].data,
      archived: r.rows[0].archived,
      pauseRequested: r.rows[0].pause_requested,
    });
  }
  public(p: MvProject): MvProject {
    return publicProject(p);
  }
  async create(owner: string, raw: unknown, key: string): Promise<MvProject> {
    assertModelCrossIdempotencyKey(key);
    const trackId = (raw as any)?.trackId;
    const track =
      typeof trackId === "string"
        ? await this.repository.getTrack(owner, trackId)
        : null;
    if (
      !track ||
      track.status !== "done" ||
      !Number.isFinite(track.duration) ||
      track.duration < 4
    )
      throw new ValidationError("请选择已完成且有时长的歌曲");
    const settings = validateSettings(raw, track.duration);
    if (settings.referenceId) await this.reference(owner, settings.referenceId);
    let aligned = settings.srt ? parseSrt(settings.srt, track.duration) : [];
    if (!aligned.length) {
      const asset = await this.repository.getAsset(
        owner,
        settings.trackId,
        "aligned_lyrics",
      );
      if (asset) {
        const stored = await this.storage.read(asset.objectKey);
        let text = "";
        for await (const b of stored.body) {
          text += b.toString();
          if (text.length > 2 * 1024 * 1024)
            throw new ValidationError("歌词时间轴过大");
        }
        aligned = alignmentCaptions(JSON.parse(text), settings.duration);
      }
    }
    const digest = createHash("sha256")
      .update(JSON.stringify(settings))
      .digest("hex");
    const now = new Date().toISOString(),
      p: StoredProject = {
        id: randomUUID(),
        owner,
        settings,
        shots: createStoryboard(settings, aligned),
        status: "draft",
        revision: 1,
        error: null,
        progress: 0,
        createdAt: now,
        updatedAt: now,
      };
    if (p.shots.length > 120)
      throw new ValidationError("歌词规划超过 120 个镜头，请增加单镜头时长");
    const r = await this.db.query(
      "INSERT INTO mv_projects(id,owner_subject,track_id,data,idempotency_key,request_digest) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_subject,idempotency_key) DO NOTHING RETURNING data",
      [p.id, owner, settings.trackId, JSON.stringify(p), key, digest],
    );
    if (r.rows[0]) return this.public(r.rows[0].data);
    const old = await this.db.query(
      "SELECT data,request_digest FROM mv_projects WHERE owner_subject=$1 AND idempotency_key=$2",
      [owner, key],
    );
    if (old.rows[0]?.request_digest !== digest)
      throw new IdempotencyConflictError("相同请求标识已用于不同 MV");
    return this.public(old.rows[0].data);
  }
  async reference(
    owner: string,
    id: string,
  ): Promise<{
    id: string;
    object_key: string;
    mime_type: string;
    name: string;
  }> {
    const r = await this.db.query(
      "SELECT id,object_key,mime_type,name FROM mv_references WHERE owner_subject=$1 AND id=$2",
      [owner, id],
    );
    if (!r.rows[0]) throw new ResourceNotFoundError("参考照片不存在");
    return r.rows[0] as any;
  }
  async upload(
    owner: string,
    bytes: Buffer,
    name: string,
  ): Promise<{ id: string; name: string; url: string }> {
    const png = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!bytes.length || bytes.length > 10 * 1024 * 1024 || (!png && !jpeg))
      throw new ValidationError("请选择小于 10 MB 的 JPEG 或 PNG 照片");
    const count = await this.db.query(
      "SELECT COUNT(*)::int AS n FROM mv_references WHERE owner_subject=$1",
      [owner],
    );
    if (count.rows[0].n >= 100)
      throw new ResourceStateConflictError("参考照片已达到 100 张上限");
    const id = randomUUID(),
      mime = png ? "image/png" : "image/jpeg",
      objectKey = `users/${ownerStoragePrefix(owner)}/mv/references/${id}.${png ? "png" : "jpg"}`;
    await this.storage.put(objectKey, bytes, mime);
    try {
      await this.db.query(
        "INSERT INTO mv_references(id,owner_subject,name,object_key,mime_type) VALUES($1,$2,$3,$4,$5)",
        [id, owner, name.slice(0, 160), objectKey, mime],
      );
    } catch (e) {
      await this.storage.delete(objectKey);
      throw e;
    }
    return { id, name, url: `/api/mv/references/${id}` };
  }
  private async save(
    p: StoredProject,
    lease?: string,
    client: DatabaseClient = this.db,
  ): Promise<void> {
    const revision = p.revision;
    p.revision++;
    p.updatedAt = new Date().toISOString();
    const r = await client.query(
      `UPDATE mv_projects SET data=$1,status=$2,revision=$3,updated_at=NOW() WHERE id=$4 AND owner_subject=$5 AND revision=$6 ${lease ? "AND lease_token=$7" : ""} RETURNING id`,
      [
        JSON.stringify(p),
        p.status,
        p.revision,
        p.id,
        p.owner,
        revision,
        ...(lease ? [lease] : []),
      ],
    );
    if (!r.rowCount)
      throw new ResourceStateConflictError(
        "MV 已由另一个窗口更新，请刷新后重试",
      );
  }
  async edit(owner: string, id: string, body: any): Promise<MvProject> {
    const p = await this.get(owner, id);
    requireEditable(p, body?.revision);
    const before = renderFingerprint(p);
    if (body.shots) editShots(p, body.shots);
    const track = await this.repository.getTrack(owner, p.settings.trackId);
    if (!track || p.settings.duration > track.duration + 0.01)
      throw new ValidationError("时间线不能超出歌曲长度");
    if (typeof body.srt === "string") {
      if (body.srt) parseSrt(body.srt, track.duration);
      p.settings.srt = body.srt;
    }
    for (const key of [
      "audioGainDb",
      "vocalGainDb",
      "instrumentalGainDb",
      "subtitleOffset",
    ] as const)
      if (body[key] !== undefined) {
        const n = body[key],
          range = key === "subtitleOffset" ? [-30, 30] : [-24, 12];
        if (
          typeof n !== "number" ||
          !Number.isFinite(n) ||
          n < range[0] ||
          n > range[1]
        )
          throw new ValidationError(`${key} 超出允许范围`);
        p.settings[key] = n;
      }
    if (body.budgetPoints !== undefined) {
      if (
        body.budgetPoints !== null &&
        (!Number.isSafeInteger(body.budgetPoints) || body.budgetPoints < 1)
      )
        throw new ValidationError("提交预算必须是正整数");
      p.settings.budgetPoints = body.budgetPoints;
    }
    for (const key of ["vocalStemId", "instrumentalStemId"] as const)
      if (body[key] !== undefined) {
        if (body[key] !== null)
          await this.stem(
            owner,
            body[key],
            p.settings.trackId,
            key === "vocalStemId" ? "vocals" : "instrumental",
          );
        p.settings[key] = body[key];
      }
    if (
      Boolean(p.settings.vocalStemId) !== Boolean(p.settings.instrumentalStemId)
    )
      throw new ValidationError("人声和伴奏分轨需成对选择");
    if (body.subtitles !== undefined) {
      if (typeof body.subtitles !== "boolean")
        throw new ValidationError("字幕开关无效");
      p.settings.subtitles = body.subtitles;
    }
    if (body.subtitleStyle !== undefined) {
      if (!["clean", "cinema"].includes(body.subtitleStyle))
        throw new ValidationError("字幕样式无效");
      p.settings.subtitleStyle = body.subtitleStyle;
    }
    if (renderFingerprint(p) !== before) markChanged(p);
    await this.save(p);
    return this.public(p);
  }
  async quote(owner: string, id: string, shotId?: string): Promise<MvQuote> {
    const p = await this.get(owner, id),
      list = p.shots.filter((s) =>
        shotId ? s.id === shotId : true,
      );
    if (shotId && !list.length) throw new ValidationError("分镜不存在");
    const shots = list.map((s) => ({
      id: s.id,
      points: estimateShot(p.settings, {
        ...s,
        generationSeconds: generationDuration(s.model, s.duration),
      }),
    }));
    const remaining=shotId?shots:shots.filter(q=>p.shots.some(s=>s.id===q.id&&['draft','failed','queued'].includes(s.status)));
    return {
      estimatedPoints: remaining.every((s) => s.points !== null)
        ? remaining.reduce((sum, s) => sum + s.points!, 0)
        : null,
      remainingPoints: null,
      reservedPoints: p.reservedPoints ?? 0,
      shots,
      source: PRICING_SOURCE,
      note: PRICING_NOTE,
    };
  }
  async stem(
    owner: string,
    id: string,
    trackId?: string,
    kind?: string,
  ): Promise<any> {
    const r = await this.db.query(
      "SELECT * FROM mv_audio_stems WHERE id=$1 AND owner_subject=$2 AND deleted_at IS NULL",
      [id, owner],
    );
    const s = r.rows[0];
    if (!s || (trackId && s.track_id !== trackId) || (kind && s.kind !== kind))
      throw new ResourceNotFoundError("分轨不存在或不属于此歌曲");
    return s;
  }
  async listStems(owner: string, trackId: string): Promise<MvStem[]> {
    if (!(await this.repository.getTrack(owner, trackId)))
      throw new ResourceNotFoundError("歌曲不存在");
    const r = await this.db.query(
      "SELECT id,kind,name,duration FROM mv_audio_stems WHERE owner_subject=$1 AND track_id=$2 AND deleted_at IS NULL ORDER BY created_at DESC",
      [owner, trackId],
    );
    return r.rows.map(
      (s) => ({ ...s, url: `/api/mv/stems/${s.id}` }) as MvStem,
    );
  }
  async previewMix(owner: string, id: string, body: any): Promise<MvProject> {
    const p = await this.get(owner, id);
    requireEditable(p, body.revision);
    if (!p.settings.vocalStemId || !p.settings.instrumentalStemId)
      throw new ValidationError("请先选择人声和伴奏分轨");
    const start = body.start ?? 0;
    if (
      typeof start !== "number" ||
      !Number.isFinite(start) ||
      start < 0 ||
      start >= p.settings.duration
    )
      throw new ValidationError("试听起点无效");
    const [v, i, a] = await Promise.all([
      this.stem(owner, p.settings.vocalStemId, p.settings.trackId, "vocals"),
      this.stem(
        owner,
        p.settings.instrumentalStemId,
        p.settings.trackId,
        "instrumental",
      ),
      this.repository.getAsset(owner, p.settings.trackId, "audio"),
    ]);
    if (!a) throw new ResourceNotFoundError("原曲不存在");
    const mix = await this.media.previewMix(
      p,
      a.objectKey,
      { vocals: v.object_key, instrumental: i.object_key },
      start,
    );
    try {
      p.mixPreviewKey = `users/${ownerStoragePrefix(owner)}/mv/${p.id}/previews/${randomUUID()}.mp3`;
      await this.storage.putFile(p.mixPreviewKey, mix.file, "audio/mpeg");
      await this.save(p);
      return this.public(p);
    } finally {
      await fs.rm(mix.directory, { recursive: true, force: true });
    }
  }
  async uploadStem(
    owner: string,
    trackId: string,
    kind: string,
    file: {
      path: string;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ): Promise<MvStem> {
    if (!["vocals", "instrumental"].includes(kind) || !file)
      throw new ValidationError("请选择人声或伴奏音频");
    const track = await this.repository.getTrack(owner, trackId);
    if (!track) throw new ResourceNotFoundError("歌曲不存在");
    const checked = await validateAudioUploadFile({
      filePath: file.path,
      originalFilename: file.originalname,
      declaredMimeType: file.mimetype,
      byteSize: file.size,
    });
    if (Math.abs(checked.durationSeconds - track.duration) > 1.5)
      throw new ValidationError(
        "分轨必须从歌曲 0 秒开始，且时长与原曲相差不超过 1.5 秒",
      );
    const id = randomUUID(),
      key = `users/${ownerStoragePrefix(owner)}/mv/stems/${id}${checked.extension}`;
    await this.storage.putFile(key, file.path, checked.mimeType);
    try {
      await this.db.query(
        "INSERT INTO mv_audio_stems(id,owner_subject,track_id,kind,object_key,name,duration) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          owner,
          trackId,
          kind,
          key,
          checked.originalFilename,
          checked.durationSeconds,
        ],
      );
    } catch (e) {
      await this.storage.delete(key);
      throw e;
    }
    return {
      id,
      kind: kind as MvStem["kind"],
      name: checked.originalFilename,
      duration: checked.durationSeconds,
      url: `/api/mv/stems/${id}`,
    };
  }
  async shotAction(owner: string, id: string, body: any): Promise<MvProject> {
    const p = await this.get(owner, id);
    requireEditable(p, body.revision);
    if (body.action === "select-version")
      selectVersion(p, body.shotId, body.versionId);
    else if (body.action === "split")
      splitShot(p, body.shotId, Number(body.at));
    else if (body.action === "accept-quality") {
      const shot = p.shots.find((s) => s.id === body.shotId);
      if (!shot?.quality) throw new ValidationError("无待确认检查");
      shot.quality.reviewed = true;
      const version = shot.versions?.find(
        (v) => v.id === shot.selectedVersionId,
      );
      if (version) version.quality = shot.quality;
      if (
        !p.shots.some((s) => s.quality?.warnings.length && !s.quality.reviewed)
      ) {
        p.error = null;
        if (p.renderWhenReady && p.shots.every((s) => s.status === "ready"))
          p.status = "assembling";
      }
    } else throw new ValidationError("不支持的镜头操作");
    await this.save(p);
    return this.public(p);
  }
  async publication(owner: string, id: string) {
    const p=await this.get(owner,id);
    const [current,output]=await Promise.all([this.repository.getAsset(owner,p.settings.trackId,'video'),p.outputKey?this.storage.head(p.outputKey):Promise.resolve(null)]);
    return { expectedChecksum:current?.checksumSha256??null, hasExistingVideo:!!current, isCurrent:!!output&&current?.checksumSha256===output.checksumSha256 };
  }
  async publish(owner:string,id:string,revision:number,expectedChecksum:unknown):Promise<MvProject>{
    if(expectedChecksum!==null&&(typeof expectedChecksum!=='string'||!/^[a-f0-9]{64}$/.test(expectedChecksum)))throw new ValidationError('需要先读取歌曲视频入口状态再发布');
    const p=await this.get(owner,id);requireEditable(p,revision);
    if(p.status!=='completed'||!p.outputKey||p.contentRevision!==p.outputRevision)throw new ResourceStateConflictError('请先合成当前修改，再发布到歌曲');
    if(p.archived)throw new ResourceStateConflictError('请先恢复归档项目');
    const output=await this.storage.head(p.outputKey);if(!output)throw new ResourceNotFoundError('成片文件不存在');
    const key=`users/${ownerStoragePrefix(owner)}/tracks/${p.settings.trackId}/video/mv-published-${randomUUID()}.mp4`;
    const copied=await this.storage.copyObject(p.outputKey,key,'video/mp4');let committed=false;
    try{
      await this.db.transaction(async client=>{
        const locked=await client.query('SELECT id,revision,status FROM mv_projects WHERE id=$1 AND owner_subject=$2 AND deleted_at IS NULL FOR UPDATE',[id,owner]);
        if(locked.rows[0]?.revision!==revision||locked.rows[0]?.status!=='completed')throw new ResourceStateConflictError('项目已经更新，请重新预览后发布');
        const source=await client.query('SELECT id FROM tracks WHERE id=$1 AND owner_subject=$2 FOR UPDATE',[p.settings.trackId,owner]);if(!source.rowCount)throw new ResourceNotFoundError('源歌曲不存在');
        const previous=await client.query("SELECT checksum_sha256 FROM track_assets WHERE track_id=$1 AND owner_subject=$2 AND kind='video' AND deleted_at IS NULL FOR UPDATE",[p.settings.trackId,owner]);
        if((previous.rows[0]?.checksum_sha256??null)!==expectedChecksum)throw new ResourceStateConflictError('歌曲视频入口已改变，请刷新并确认后再发布');
        await this.repository.upsertAsset({id:randomUUID(),trackId:p.settings.trackId,ownerSubject:owner,kind:'video',objectKey:copied.key,mimeType:copied.mimeType,byteSize:copied.byteSize,checksumSha256:copied.checksumSha256,etag:copied.etag},client);
        p.publishedVideoKey=key;p.publishedRevision=p.outputRevision;p.publishedAt=new Date().toISOString();await this.save(p,undefined,client);
      });committed=true;return this.public(p);
    }finally{if(!committed)await this.storage.delete(key).catch(()=>undefined);}
  }
  async archive(
    owner: string,
    id: string,
    revision: number,
    archived: boolean,
  ): Promise<void> {
    const p = await this.get(owner, id);
    requireEditable(p, revision);
    if(p.shots.some(s=>["running","submitting","uncertain"].includes(s.status)))throw new ResourceStateConflictError("请先核对尚未结束的上游任务，再归档");
    await this.db.query(
      "UPDATE mv_projects SET archived_at=CASE WHEN $3 THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$1 AND owner_subject=$2",
      [id, owner, archived],
    );
  }
  async deleteProject(
    owner: string,
    id: string,
    revision: number,
  ): Promise<void> {
    const p = await this.get(owner, id);
    requireEditable(p, revision);
    if (
      p.shots.some((s) =>
        ["running", "submitting", "uncertain"].includes(s.status),
      )
    )
      throw new ResourceStateConflictError("请先核对尚未结束的上游任务");
    const keys = new Set<string>(
      await this.storage.list(`users/${ownerStoragePrefix(owner)}/mv/${p.id}/`),
    );
    p.shots.forEach((s) => {
      if (s.objectKey) keys.add(s.objectKey);
      s.versions?.forEach((v) => {
        if (v.objectKey) keys.add(v.objectKey);
      });
    });
    p.renderVersions?.forEach((v) => {
      if (v.objectKey) keys.add(v.objectKey);
      if (v.subtitleKey) keys.add(v.subtitleKey);
    });
    if (p.outputKey) keys.add(p.outputKey);
    if (p.subtitleKey) keys.add(p.subtitleKey);
    await this.db.transaction(async (client) => {
      const deleted = await client.query(
        "UPDATE mv_projects SET deleted_at=NOW() WHERE id=$1 AND owner_subject=$2 AND revision=$3 AND lease_token IS NULL RETURNING id",
        [id, owner, revision],
      );
      if (!deleted.rowCount)
        throw new ResourceStateConflictError("项目仍在处理中");
      for (const key of keys)
        await client.query(
          "INSERT INTO storage_tombstones(id,owner_subject,object_key,reason) VALUES($1,$2,$3,'mv_deleted') ON CONFLICT(object_key) DO NOTHING",
          [randomUUID(), owner, key],
        );
    });
  }
  async references(owner: string) {
    const r = await this.db.query(
      "SELECT id,name FROM mv_references WHERE owner_subject=$1 ORDER BY created_at DESC",
      [owner],
    );
    return r.rows.map((v) => ({ ...v, url: `/api/mv/references/${v.id}` }));
  }
  async deleteReference(owner: string, id: string): Promise<void> {
    await this.reference(owner, id);
    const used = await this.db.query(
      "SELECT id FROM mv_projects WHERE owner_subject=$1 AND deleted_at IS NULL AND data->'settings'->>'referenceId'=$2 LIMIT 1",
      [owner, id],
    );
    if (used.rowCount)
      throw new ResourceStateConflictError(
        "照片被现有 MV 使用，请保留或删除对应项目后再清理",
      );
    const ref = await this.reference(owner, id);
    await this.storage.delete(ref.object_key);
    await this.db.query(
      "DELETE FROM mv_references WHERE id=$1 AND owner_subject=$2",
      [id, owner],
    );
  }
  async pause(owner: string, id: string): Promise<MvProject> {
    const p = await this.get(owner, id);
    if (p.status !== "generating")
      throw new ResourceStateConflictError("只有正在生成的项目可以停止新镜头");
    await this.db.query(
      "UPDATE mv_projects SET pause_requested=TRUE WHERE id=$1 AND owner_subject=$2",
      [id, owner],
    );
    return this.public({ ...p, pauseRequested: true });
  }
  async reconcile(
    session: AuthenticatedSession,
    id: string,
    body: any,
  ): Promise<MvProject> {
    const p = await this.get(session.user.subject, id);
    requireEditable(p, body.revision);
    const s = p.shots.find((v) => v.id === body.shotId);
    if (!s) throw new ResourceNotFoundError("镜头不存在");
    if (!s.providerTaskId) {
      if (
        s.status !== "uncertain" ||
        !session.user.roles.some((r) => ["admin", "root"].includes(r))
      )
        throw new ResourceStateConflictError(
          "未知提交只能由管理员核对并关联上游任务",
        );
      if (
        typeof body.taskId !== "string" ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(body.taskId)
      )
        throw new ValidationError("请输入有效的上游任务 ID");
      const other = await this.db.query(
        "SELECT id FROM mv_projects WHERE id<>$1 AND data::text LIKE $2 LIMIT 1",
        [p.id, `%${body.taskId}%`],
      );
      if (other.rowCount)
        throw new ResourceStateConflictError("该上游任务已经关联其它项目");
      s.providerTaskId = body.taskId;
    }
    await this.provider.request(
      `${videoModel(s.model).queryEndpoint}?task_id=${encodeURIComponent(s.providerTaskId!)}`,
    );
    s.status = "running";
    s.pollFailures = 0;
    s.error = null;
    p.status = "generating";
    p.error = null;
    p.renderWhenReady = false;
    await this.save(p);
    await this.db.query(
      "UPDATE mv_projects SET pause_requested=TRUE,next_poll_at=NOW() WHERE id=$1",
      [id],
    );
    return this.public(p);
  }
  async start(
    session: AuthenticatedSession,
    id: string,
    body: any,
  ): Promise<MvProject> {
    const p = await this.get(session.user.subject, id);
    if (p.revision !== body.revision)
      throw new ResourceStateConflictError("项目版本已改变，请刷新");
    if (!["draft", "failed", "paused", "completed"].includes(p.status))
      throw new ResourceStateConflictError("项目已经在生成或已完成");
    if (!(await this.provider.configured()) || !(await this.media.ready()))
      throw new ResourceStateConflictError("视频服务或合成服务未配置");
    if (p.settings.performance === "audio" && !(await this.storageReady()))
      throw new ResourceStateConflictError(
        "音频参考需要可被视频服务访问的签名存储地址",
      );
    const targets = p.shots.filter((s) => !body.shotId || s.id === body.shotId);
    if (!targets.length) throw new ValidationError("分镜不存在");
    if (
      targets.some((s) => s.status === "uncertain" || s.status === "submitting")
    )
      throw new ResourceStateConflictError(
        "有提交结果未知的分镜，请先核对上游任务，避免重复扣费",
      );
    if (
      !targets.some(
        (s) =>
          ["draft", "failed", "queued"].includes(s.status) ||
          (s.status === "ready" && body.regenerate === true && !!body.shotId),
      )
    )
      throw new ResourceStateConflictError("所选镜头已完成");
    if (p.archived) throw new ResourceStateConflictError("请先恢复归档项目");
    for (const s of targets)
      if (["draft", "failed", "queued", "ready"].includes(s.status))
        s.generationSeconds = generationDuration(s.model, s.duration);
    const estimate = targets
      .filter(
        (s) =>
          ["draft", "failed", "queued"].includes(s.status) ||
          (s.status === "ready" && body.regenerate === true),
      )
      .map((s) => estimateShot(p.settings, s));
    if (estimate.some((v) => v === null))
      throw new ResourceStateConflictError(
        "所选模型没有可用估算，请先配置计价",
      );
    const amount = estimate.reduce<number>((n, v) => n + (v ?? 0), 0);
    if (
      p.settings.budgetPoints != null &&
      (p.reservedPoints ?? 0) + amount > p.settings.budgetPoints
    )
      throw new ResourceStateConflictError(
        `此次预计 ${amount} API 点数，超过剩余提交预算，请调整预算或减少镜头`,
      );
    if (this.provider.probe) {
      const check = await this.provider.probe(true);
      if (!check.authenticated)
        throw new ResourceStateConflictError(check.error || "API 账户不可用");
      if (check.remainingPoints !== null && amount > check.remainingPoints)
        throw new ResourceStateConflictError(
          `此次预计 ${amount} API 点数，超过 API 账户当前可用额度`,
        );
    }
    if (
      p.settings.subtitles &&
      !p.settings.srt &&
      !p.alignmentJobId &&
      !(await this.repository.getAsset(
        p.owner,
        p.settings.trackId,
        "aligned_lyrics",
      ))
    ) {
      const track = await this.repository.getTrack(p.owner, p.settings.trackId);
      if (!track?.lyrics)
        throw new ValidationError("歌曲无歌词，请上传 SRT 或关闭字幕");
      const aligned = await this.sunoActions.assetAction(
        session,
        p.settings.trackId,
        { action: "aligned_lyrics", lyrics: track.lyrics },
        `mv-lyrics-${p.id}`,
      );
      p.alignmentJobId = aligned.job.id;
    }
    for (const s of targets)
      if (
        ["draft", "failed"].includes(s.status) ||
        (s.status === "ready" && body.regenerate === true && !!body.shotId)
      ) {
        s.attempt = (s.attempt ?? 0) + 1;
        s.estimatedPoints = estimateShot(p.settings, s);
        s.providerPoints = null;
        s.pollFailures = 0;
        s.accountedPoints = undefined;
        s.status = "queued";
        s.error = null;
        s.providerTaskId = null;

        s.providerUrl = undefined;
      }
    p.status = "generating";
    p.pauseRequested = false;
    p.error = null;
    if (body.regenerate) markChanged(p);
    p.renderWhenReady = !body.shotId;
    await this.db.transaction(async (client) => {
      await client.query(
        "SELECT subject FROM identity_links WHERE subject=$1 FOR UPDATE",
        [p.owner],
      );
      const active = await client.query(
        "SELECT COUNT(*)::int AS n FROM mv_projects WHERE owner_subject=$1 AND status IN ('generating','assembling')",
        [p.owner],
      );
      if (active.rows[0].n >= 2)
        throw new ResourceStateConflictError(
          "At most two MV projects can run at the same time",
        );
      await this.save(p, undefined, client);
      await client.query(
        "UPDATE mv_projects SET pause_requested=FALSE,next_poll_at=NOW() WHERE id=$1",
        [p.id],
      );
    });
    return this.public(p);
  }
  async assemble(
    owner: string,
    id: string,
    revision: number,
  ): Promise<MvProject> {
    const p = await this.get(owner, id);
    if (p.revision !== revision)
      throw new ResourceStateConflictError("项目版本已改变");
    if (p.shots.some((s) => s.quality?.warnings.length && !s.quality?.reviewed))
      throw new ResourceStateConflictError(
        "有疑似静止镜头，请预览并确认画面检查后再合成",
      );
    if (
      !["draft", "failed", "completed", "paused"].includes(p.status) ||
      !p.shots.every((s) => s.status === "ready")
    )
      throw new ResourceStateConflictError("请先完成所有镜头");
    p.status = "assembling";
    p.renderWhenReady = false;
    p.error = null;
    await this.save(p);
    return this.public(p);
  }
  async startWorker(): Promise<void> {
    await this.media.ready().then((r) => (this.rendererReady = r));
    this.timer = setInterval(() => {
      if (!this.active)
        this.active = this.tick("generation")
          .catch((e) =>
            console.error(
              JSON.stringify({ event: "mv.worker.error", error: String(e) }),
            ),
          )
          .finally(() => (this.active = null));
      if (!this.renderActive)
        this.renderActive = this.tick("render")
          .catch((e) =>
            console.error(
              JSON.stringify({ event: "mv.render.error", error: String(e) }),
            ),
          )
          .finally(() => (this.renderActive = null));
    }, 5000);
    this.timer.unref();
  }
  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await Promise.allSettled([this.active, this.renderActive].filter(Boolean));
  }
  async tick(phase?: "generation" | "render"): Promise<void> {
    const lease = randomUUID();
    const r = await this.db.query(
      `UPDATE mv_projects SET lease_token=$1,lease_until=NOW()+INTERVAL '20 minutes' WHERE id=(SELECT id FROM mv_projects WHERE ${phase === "generation" ? "status='generating'" : phase === "render" ? "status='assembling'" : "status IN ('generating','assembling')"} AND deleted_at IS NULL AND archived_at IS NULL AND next_poll_at<=NOW() AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY next_poll_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING data`,
      [lease],
    );
    if (!r.rows[0]) return;
    const p: StoredProject = normalizeProject(r.rows[0].data);
    const heartbeat = setInterval(() => {
      void this.db
        .query(
          "UPDATE mv_projects SET lease_until=NOW()+INTERVAL '20 minutes' WHERE id=$1 AND lease_token=$2",
          [p.id, lease],
        )
        .catch(() => undefined);
    }, 60_000);
    heartbeat.unref();
    let delaySeconds = 10;
    try {
      if (p.status === "assembling") {
        await this.render(p, lease);
        return;
      }
      for (const shot of p.shots) {
        if (shot.status === "submitting") {
          shot.status = "uncertain";
          shot.error =
            "提交中断，结果未知；请核对视频服务中的任务，未自动重复请求。";
        }
        if (shot.status !== "running" || !shot.providerTaskId) continue;
        const model = videoModel(shot.model),
          data = await this.provider.request(
            `${model.queryEndpoint}?task_id=${encodeURIComponent(shot.providerTaskId)}`,
          );
        if (
          typeof data.points_cost === "number" &&
          Number.isFinite(data.points_cost) &&
          data.points_cost >= 0
        ) {
          const accounted = shot.accountedPoints ?? shot.estimatedPoints ?? 0;
          const current = data.points_refunded === true ? 0 : data.points_cost;
          p.reservedPoints = Math.max(
            0,
            (p.reservedPoints ?? 0) + current - accounted,
          );
          shot.accountedPoints = current;
          shot.providerPoints = data.points_cost;
        }
        if (typeof data.points_refunded === "boolean")
          shot.pointsRefunded = data.points_refunded;
        if (["failed", "error", "cancelled"].includes(data.status)) {
          shot.status = "failed";
          shot.error = String(data.error || "上游视频生成失败").slice(0, 350);
          continue;
        }
        if (data.status !== "completed") continue;
        const url = data.video_url || data.proxy_url;
        if (typeof url !== "string") throw new Error("已完成任务没有视频地址");
        const download = await downloadAssetToFile(
          url,
          "video",
          this.config.storage,
        );
        try {
          const info = await this.media.probe(
            path.basename(download.filePath),
            path.dirname(download.filePath),
          );
          if (info.duration + 0.15 < shot.duration)
            throw new Error(`第 ${shot.index + 1} 镜长度不足`);
          const key = `users/${ownerStoragePrefix(p.owner)}/mv/${p.id}/shots/${shot.id}/attempt-${shot.attempt ?? 1}.mp4`;
          await this.storage.putFile(key, download.filePath, "video/mp4");
          saveShotVersion(shot, key, info.duration);
          if (this.media.inspectMotion)
            shot.quality = await this.media.inspectMotion(
              path.basename(download.filePath),
              path.dirname(download.filePath),
            );
          const selectedVersion = shot.versions?.find(
            (v) => v.id === shot.selectedVersionId,
          );
          if (selectedVersion) selectedVersion.quality = shot.quality;
          shot.providerUrl = undefined;
        } finally {
          await fs.rm(download.temporaryDirectory, {
            recursive: true,
            force: true,
          });
        }
        await this.save(p, lease);
      }
      const control = await this.db.query(
        "SELECT pause_requested FROM mv_projects WHERE id=$1",
        [p.id],
      );
      p.pauseRequested = control.rows[0]?.pause_requested === true;
      const queued =
        !p.pauseRequested && p.shots.find((s) => s.status === "queued");
      if (queued && p.shots.filter((s) => s.status === "running").length < 2)
        await this.submitShot(p, queued, lease);
      p.progress =
        p.shots.filter((s) => s.status === "ready").length / p.shots.length;
      if (
        p.pauseRequested &&
        !p.shots.some((s) => ["running", "submitting"].includes(s.status))
      ) {
        p.status = "paused";
      } else if (
        !p.shots.some((s) =>
          ["running", "queued", "submitting"].includes(s.status),
        )
      ) {
        p.status = p.shots.some((s) =>
          ["failed", "uncertain"].includes(s.status),
        )
          ? "failed"
          : p.renderWhenReady &&
              p.shots.every((s) => s.status === "ready") &&
              !p.shots.some(
                (s) => s.quality?.warnings.length && !s.quality.reviewed,
              )
            ? "assembling"
            : "draft";
        if (
          p.shots.every((s) => s.status === "ready") &&
          p.shots.some((s) => s.quality?.warnings.length && !s.quality.reviewed)
        ) {
          p.status = "paused";
          p.error = "部分镜头疑似长时间静止，请逐镜预览并确认画面检查。";
        }
        if (p.status === "failed")
          p.error = "部分分镜生成失败，请查看镜头错误并单独重试。";
      }
      await this.save(p, lease);
    } catch (e) {
      const submitting = p.shots.find((s) => s.status === "submitting");
      if (submitting) {
        submitting.status = "uncertain";
        submitting.error = "提交结果未知，未自动重试，以免重复收费。";
        p.pauseRequested = true;
        await this.db.query(
          "UPDATE mv_projects SET pause_requested=TRUE WHERE id=$1",
          [p.id],
        );
      }
      p.error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      delaySeconds = Math.min(
        300,
        10 *
          2 **
            Math.min(
              5,
              Math.max(0, ...p.shots.map((s) => s.pollFailures ?? 0)),
            ),
      );
      if (p.status === "assembling") p.status = "failed";
      else {
        const failedPoll = p.shots.find((s) => s.status === "running");
        if (failedPoll) {
          failedPoll.pollFailures = (failedPoll.pollFailures ?? 0) + 1;
          if (failedPoll.pollFailures >= 8) {
            p.status = "paused";
            p.error =
              "查询连续失败，已暂停后续提交；使用“重新查询任务”恢复，不会重新扣费。";
          }
        }
      }
      await this.save(p, lease).catch(() => undefined);
    } finally {
      clearInterval(heartbeat);
      await this.db.query(
        "UPDATE mv_projects SET lease_token=NULL,lease_until=NULL,next_poll_at=NOW()+($3 * INTERVAL '1 second') WHERE id=$1 AND lease_token=$2",
        [p.id, lease, delaySeconds],
      );
    }
  }
  private async submitShot(
    p: StoredProject,
    shot: MvShot,
    lease: string,
  ): Promise<void> {
    let image: string | undefined, audio: string | undefined;
    if (p.settings.referenceId) {
      const ref = await this.reference(p.owner, p.settings.referenceId);
      const object = await this.storage.read(ref.object_key);
      const chunks: Buffer[] = [];
      for await (const b of object.body) chunks.push(Buffer.from(b));
      image = await this.provider.uploadImage(
        Buffer.concat(chunks),
        ref.mime_type,
      );
    }
    if (p.settings.performance === "audio") {
      const asset = await this.repository.getAsset(
        p.owner,
        p.settings.trackId,
        "audio",
      );
      if (!asset) throw new Error("歌曲音频未就绪");
      const segment = await this.media.segment(
        asset.objectKey,
        shot.start,
        shot.generationSeconds,
      );
      try {
        const key = `users/${ownerStoragePrefix(p.owner)}/mv/${p.id}/audio/${shot.id}-${shot.attempt ?? 1}.mp3`;
        await this.storage.putFile(key, segment.file, "audio/mpeg");
        audio =
          (await this.storage.signedGetUrl(key, { expiresIn: 3600 })) ??
          undefined;
        if (!audio) throw new Error("音频签名地址不可用");
      } finally {
        await fs.rm(segment.directory, { recursive: true, force: true });
      }
    }
    const control = await this.db.query(
      "SELECT pause_requested FROM mv_projects WHERE id=$1",
      [p.id],
    );
    if (control.rows[0]?.pause_requested) return;
    const estimated = estimateShot(p.settings, shot);
    if (estimated === null) throw new Error("无法估算当前镜头费用");
    if (
      p.settings.budgetPoints != null &&
      (p.reservedPoints ?? 0) + estimated > p.settings.budgetPoints
    ) {
      p.pauseRequested = true;
      p.status = p.shots.some((s) => s.status === "running")
        ? "generating"
        : "paused";
      p.error = "已达到提交预算，后续镜头暂停";
      await this.db.query(
        "UPDATE mv_projects SET pause_requested=TRUE WHERE id=$1",
        [p.id],
      );
      await this.save(p, lease);
      return;
    }
    shot.estimatedPoints = estimated;
    shot.attempt ??= 1;
    p.reservedPoints = (p.reservedPoints ?? 0) + estimated;
    shot.submittedAt = new Date().toISOString();
    shot.status = "submitting";
    await this.save(p, lease);
    try {
      const model = videoModel(shot.model),
        data = await this.provider.request(
          model.endpoint,
          videoPayload(model, shot, p.settings, image, audio),
          `mv-${shot.id}-${shot.attempt ?? 1}`,
        );
      if (!data.task_id) throw new Error("视频服务未返回任务标识");
      shot.providerTaskId = String(data.task_id);
      shot.status = "running";
      await this.save(p, lease);
    } catch (e) {
      const status = (e as any).status;
      if (status >= 400 && status < 500) {
        shot.status = "failed";
        p.reservedPoints = Math.max(
          0,
          (p.reservedPoints ?? 0) - (shot.estimatedPoints ?? 0),
        );
        shot.error = String((e as Error).message);
        if ([401, 402, 403, 429].includes(status)) {
          p.pauseRequested = true;
          await this.db.query(
            "UPDATE mv_projects SET pause_requested=TRUE WHERE id=$1",
            [p.id],
          );
        }
        await this.save(p, lease);
      } else throw e;
    }
  }
  private async render(p: StoredProject, lease: string): Promise<void> {
    const asset = await this.repository.getAsset(
      p.owner,
      p.settings.trackId,
      "audio",
    );
    if (!asset) throw new Error("歌曲音频未就绪");
    let captions = p.settings.srt ? parseSrt(p.settings.srt, 600) : [];
    if (p.settings.subtitles && !captions.length) {
      const aligned = await this.repository.getAsset(
        p.owner,
        p.settings.trackId,
        "aligned_lyrics",
      );
      if (!aligned) {
        const job = p.alignmentJobId
          ? await this.repository.getTrackAssetJob(p.owner, p.alignmentJobId)
          : null;
        if (job?.status === "failed")
          throw new Error("歌词对齐失败，请上传已校对的 SRT 字幕后重试合成");
        return;
      }
      const r = await this.storage.read(aligned.objectKey);
      let text = "";
      for await (const b of r.body) text += b.toString();
      captions = alignmentCaptions(JSON.parse(text), p.settings.duration);
    }
    const offset = p.settings.subtitleOffset ?? 0;
    captions = captions
      .map((c) => ({
        ...c,
        start: Math.max(0, c.start + offset),
        end: Math.min(p.settings.duration, c.end + offset),
      }))
      .filter((c) => c.end > c.start);
    const stems =
      p.settings.vocalStemId && p.settings.instrumentalStemId
        ? {
            vocals: (
              await this.stem(
                p.owner,
                p.settings.vocalStemId,
                p.settings.trackId,
                "vocals",
              )
            ).object_key,
            instrumental: (
              await this.stem(
                p.owner,
                p.settings.instrumentalStemId,
                p.settings.trackId,
                "instrumental",
              )
            ).object_key,
          }
        : undefined;
    const result = await this.media.render(p, asset.objectKey, captions, stems);
    try {
      const prefix = `users/${ownerStoragePrefix(p.owner)}/mv/${p.id}/renders/${randomUUID()}`;
      const stored = await this.storage.putFile(
        `${prefix}/final.mp4`,
        result.file,
        "video/mp4",
      );
      p.outputKey = stored.key;
      p.subtitleKey = `${prefix}/lyrics.srt`;
      await this.storage.put(
        p.subtitleKey,
        Buffer.from(result.srt),
        "application/x-subrip",
      );
      p.outputRevision = p.contentRevision ?? 1;
      p.renderVersions ??= [];
      p.renderVersions.push({
        id: randomUUID(),
        objectKey: p.outputKey,
        subtitleKey: p.subtitleKey,
        contentRevision: p.outputRevision,
        createdAt: new Date().toISOString(),
        duration: p.settings.duration,
      });
      p.status = "completed";
      p.progress = 1;
      p.error = null;
      await this.save(p, lease);
    } finally {
      await fs.rm(result.directory, { recursive: true, force: true });
    }
  }
}
