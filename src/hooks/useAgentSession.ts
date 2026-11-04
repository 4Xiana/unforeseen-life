import { useState, useCallback, useRef, useEffect } from 'react';
import { createSession, sendMessage, sendPhoto, fetchProfile, updateProfile, fetchQuestPairs } from '../api';
import type { FSMState, ActivityPlan, PublishedStep, SSEEvent, TimelineItem, HandbookView, BadgeState, QuestCategory, QuestProgress, ArchivedQuest, EnvInfo, UserProfile, SaveProfileInput, QuestPair } from '../types';
import { getClientId, saveClientId, fetchHandbook } from '../handbook';
import { useGeolocation, type GeoCoords } from './useGeolocation';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// 与后端"换一批"意图识别对齐：玩家明确表达重刷时，立即乐观渲染活动骨架屏
const REFRESH_RE = /换一批|换一组|换几个|换点别的|再来(一)?(批|组|些|个|点)|没看上|没兴趣|不太喜欢|不喜欢这|还有吗|别的呢|其他的呢/;

export interface QuestReward {
  questTitle: string;
  category: QuestCategory;
  newBadges: BadgeState[];
}

export function useAgentSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [fsmState, setFsmState] = useState<FSMState>('S0');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [steppingText, setSteppingText] = useState<string | null>(null);
  // 骨架屏门控：进入 S1/S2 后挂起待生成的 UI 类型，Agent 输出引导文字后才放行骨架屏
  const [uiPending, setUiPending] = useState<'activities' | 'step' | null>(null);
  const [uiGuided, setUiGuided] = useState(false);
  // 乐观骨架：玩家点选活动/换一批的瞬间就显示，不等服务端事件，消灭等待空白
  const [uiOptimistic, setUiOptimistic] = useState<'activities' | 'step' | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [started, setStarted] = useState(false);
  const [handbook, setHandbook] = useState<HandbookView | null>(null);
  // 玩家喜好档案（长期记忆）：落点页右上角入口据此显示首访红点，每轮上下文自动注入
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Pair-wise 真实任务对：第二页快速对比用
  const [questPairs, setQuestPairs] = useState<QuestPair[]>([]);
  const [reward, setReward] = useState<QuestReward | null>(null);
  // 当前支线任务进度：步骤卡在瀑布流里会被刷上去，抽屉靠这份聚合数据常驻展示
  const [quest, setQuest] = useState<QuestProgress | null>(null);
  // 已经走完/放弃的支线：抽屉时间轴里逐条累积，挑选→进行→完成全程可回溯
  const [questHistory, setQuestHistory] = useState<ArchivedQuest[]>([]);
  // 最新一批待选支线（S1）：任务板抽屉在选任务阶段直接展示/选择，不必翻聊天
  const [proposedActivities, setProposedActivities] = useState<ActivityPlan[]>([]);
  // 后端解析出的玩家环境（城市/天气），由 env_resolved 事件回传，供 header 定位徽章展示
  const [envInfo, setEnvInfo] = useState<EnvInfo | null>(null);
  // 定位：授权后 watch 持续刷新坐标，随每条消息上行，后端据此解析城市/天气默认注入上下文
  const geo = useGeolocation();
  const clientIdRef = useRef<string>(getClientId());

  // 发消息的回调依赖稳定，用 ref 读最新坐标，避免闭包拿到旧值
  const geoCoordsRef = useRef<GeoCoords | null>(null);
  useEffect(() => { geoCoordsRef.current = geo.coords; }, [geo.coords]);

  // 一进应用（落点页）就请求定位授权：开了之后 header 才出现定位徽章，
  // 授权结果不阻塞开场，拿到坐标后从下一条消息开始随请求上行
  useEffect(() => {
    geo.request();
  }, [geo.request]);

  // 落点页加载长期喜好档案（用本地稳定 clientId，无需先开 session）：
  // 决定右上角入口是否显示"首次"红点
  useEffect(() => {
    let alive = true;
    fetchProfile(clientIdRef.current)
      .then((p) => { if (alive && p) setProfile(p); })
      .catch(() => {});
    fetchQuestPairs()
      .then((q) => { if (alive && q) setQuestPairs(q); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const abortRef = useRef<AbortController | null>(null);
  const activeRequestRef = useRef(false);
  const streamingTextRef = useRef('');
  const streamingItemIdRef = useRef<string | null>(null);
  const handleEventRef = useRef<(event: SSEEvent) => void>(() => {});
  const startedRef = useRef(false);
  const timelineRef = useRef<TimelineItem[]>(timeline);
  // state_changed 回调里读最新 quest（事件回调依赖稳定，不随 quest 重建）
  const questRef = useRef<QuestProgress | null>(null);
  // 已归档过的支线 key：S3/S0 事件可能重复到达，防止同一条支线重复进时间轴
  const archivedQuestRef = useRef<string>('');
  // 当前支线的唯一 key：新支线 step0 发布时换新；归档记录据此判重
  const questKeyRef = useRef<string>('');
  // 刚 push 进对话流的照片 item id：收到后端 photo_saved 后把 object URL 换成持久化 URL
  const pendingPhotoItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

  useEffect(() => {
    questRef.current = quest;
  }, [quest]);

  const pushItem = useCallback((item: TimelineItem) => {
    setTimeline(prev => [...prev, item]);
  }, []);

  const pushUserText = useCallback((content: string) => {
    pushItem({ id: uid(), kind: 'user', content, timestamp: Date.now() });
  }, [pushItem]);

  const start = useCallback((initialText?: string) => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);

    const ac = new AbortController();
    let cancelled = false;
    abortRef.current = ac;
    activeRequestRef.current = false;

    const hasPreFill = !!initialText && initialText.trim().length > 0;
    const kickoffMessage = hasPreFill
      ? initialText!.trim()
      : '（用户刚刚打开了应用）';

    async function init() {
      try {
        activeRequestRef.current = true;
        setIsConnecting(true);
        setError(null);
        const { sessionId: id, clientId: cid } = await createSession(clientIdRef.current, ac.signal);
        if (cancelled) return;
        clientIdRef.current = cid;
        saveClientId(cid);
        setSessionId(id);
        setIsConnecting(false);
        setIsStreaming(true);
        fetchHandbook(cid).then(v => { if (!cancelled && v) setHandbook(v); }).catch(() => {});

        await sendMessage({
          sessionId: id,
          type: 'text',
          text: kickoffMessage,
          geo: geoCoordsRef.current ?? undefined,
          onEvent: (event) => handleEventRef.current(event),
          signal: ac.signal,
        });
      } catch (err) {
        if (cancelled || ac.signal.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('abort') || msg.includes('Abort')) return;
        setError(msg);
        setIsConnecting(false);
        setIsStreaming(false);
      } finally {
        activeRequestRef.current = false;
      }
    }

    init();
  }, []);

  useEffect(() => {
    return () => {
      if (activeRequestRef.current && abortRef.current) {
        abortRef.current.abort();
      }
      startedRef.current = false;
      activeRequestRef.current = false;
    };
  }, []);

  const finalizeStreamingMessage = useCallback(() => {
    if (streamingItemIdRef.current && streamingTextRef.current.length > 0) {
      const itemId = streamingItemIdRef.current;
      const finalText = streamingTextRef.current;
      setTimeline(prev => prev.map(it =>
        it.id === itemId && (it.kind === 'npc' || it.kind === 'user')
          ? { ...it, content: finalText }
          : it
      ));
    }
    streamingTextRef.current = '';
    streamingItemIdRef.current = null;
  }, []);

  const handleEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case 'turn_start': {
        const itemId = uid();
        streamingItemIdRef.current = itemId;
        streamingTextRef.current = '';
        setUiPending(null);
        setUiGuided(false);
        pushItem({
          id: itemId,
          kind: 'npc',
          content: '',
          timestamp: Date.now(),
        });
        break;
      }

      case 'text_delta': {
        const delta = event.text as string;
        if (!delta) break;
        streamingTextRef.current += delta;
        setUiGuided(true);
        if (streamingItemIdRef.current) {
          const itemId = streamingItemIdRef.current;
          setTimeline(prev => prev.map(it =>
            it.id === itemId && (it.kind === 'npc' || it.kind === 'user')
              ? { ...it, content: streamingTextRef.current }
              : it
          ));
        }
        break;
      }

      case 'thinking_start': {
        setIsThinking(true);
        setSteppingText(null);
        break;
      }

      case 'thinking_end': {
        setIsThinking(false);
        break;
      }

      case 'stepping': {
        setIsThinking(false);
        setSteppingText(event.text as string);
        break;
      }

      case 'stepping_end': {
        setSteppingText(null);
        break;
      }

      case 'state_changed': {
        const to = event.to as FSMState;
        setFsmState(to);
        if (to === 'S0') {
          setCompleted(false);
          setUiPending(null);
          // S2/S1 中途放弃回到 S0：进行中的支线以"已放下"归档进时间轴（S1 还没选任务时 quest 为空，不归档）
          const q = questRef.current;
          if (q && archivedQuestRef.current !== questKeyRef.current) {
            archivedQuestRef.current = questKeyRef.current;
            setQuestHistory(prev => [...prev, { id: questKeyRef.current, title: q.title, total: q.total, steps: q.steps, status: 'abandoned', at: Date.now() }]);
            setQuest(null);
          }
        }
        if (to === 'S1') {
          // 活动卡片待生成：先挂起，等 Agent 输出引导文字后再放行骨架屏
          setUiPending('activities');
          setUiGuided(false);
          // S2 放弃支线退回挑选（或 S3 后再来一条）：上一条进行中且未归档的支线
          // 以"已放下"进时间轴；已走完归档过的（S3→S1）判重跳过
          const q = questRef.current;
          if (q && archivedQuestRef.current !== questKeyRef.current) {
            archivedQuestRef.current = questKeyRef.current;
            setQuestHistory(prev => [...prev, { id: questKeyRef.current, title: q.title, total: q.total, steps: q.steps, status: 'abandoned', at: Date.now() }]);
          }
        }
        if (to === 'S2') {
          // 第一步卡片待生成：同样等引导文字后再出骨架屏；旧卡片留在瀑布流里
          setUiPending('step');
          setUiGuided(false);
        }
        if (to === 'S3') {
          setUiPending(null);
          // 走完一条支线：以"已完成"归档进时间轴（quest 本体保留供当前进度展示；同一条防重复归档）
          const q = questRef.current;
          if (q && archivedQuestRef.current !== questKeyRef.current) {
            archivedQuestRef.current = questKeyRef.current;
            setQuestHistory(prev => [...prev, { id: questKeyRef.current, title: q.title, total: q.total, steps: q.steps, status: 'done', at: Date.now() }]);
          }
        }
        break;
      }

      case 'activities_proposed': {
        const activities = event.activities as ActivityPlan[];
        pushItem({
          id: uid(),
          kind: 'activities',
          activities,
          timestamp: Date.now(),
        });
        setProposedActivities(activities);
        setSteppingText(null);
        setUiPending(null);
        setUiOptimistic(null);
        break;
      }

      case 'step_published': {
        const publishedStep = event.step as PublishedStep;
        const total = event.total as number;
        const activityTitle = event.activityTitle as string | undefined;
        // 新支线发车（step0）：换一把支线 key，归档判重以此为准
        if (publishedStep.index === 0) questKeyRef.current = `q${Date.now()}`;
        pushItem({
          id: uid(),
          kind: 'step',
          step: publishedStep,
          total,
          timestamp: Date.now(),
        });
        // 聚合当前支线进度：step 0 = 新支线重新记账；同号重发去重；标题以事件为准
        setQuest(prev => {
          const fresh = publishedStep.index === 0 || !prev;
          const steps = fresh
            ? [publishedStep]
            : [...prev.steps.filter(s => s.index !== publishedStep.index), publishedStep]
                .sort((a, b) => a.index - b.index);
          return {
            id: fresh ? questKeyRef.current : prev.id,
            title: activityTitle || prev?.title || '当前支线',
            total: total || prev?.total || steps.length,
            steps,
          };
        });
        setSteppingText(null);
        setUiPending(null);
        setUiOptimistic(null);
        break;
      }

      case 'task_completed': {
        setCompleted(true);
        break;
      }

      case 'env_resolved': {
        // 后端据定位坐标解析出城市/天气：header 定位徽章据此显示"城市 · 天气"
        if (event.env) setEnvInfo(event.env as EnvInfo);
        break;
      }

      case 'handbook_updated': {
        if (event.view) setHandbook(event.view as HandbookView);
        setReward({
          questTitle: (event.questTitle as string) || '这条支线',
          category: (event.category as QuestCategory) || 'sense',
          newBadges: (event.newBadges as BadgeState[]) || [],
        });
        break;
      }

      case 'turn_complete': {
        finalizeStreamingMessage();
        setIsStreaming(false);
        setIsThinking(false);
        setSteppingText(null);
        setUiPending(null);
        setUiGuided(false);
        setUiOptimistic(null);

        const finalState = event.fsmState as FSMState | undefined;
        if (finalState) setFsmState(finalState);

        streamingItemIdRef.current = null;
        streamingTextRef.current = '';
        break;
      }

      case 'error': {
        finalizeStreamingMessage();
        setIsStreaming(false);
        setIsThinking(false);
        setSteppingText(null);
        setUiPending(null);
        setUiGuided(false);
        setUiOptimistic(null);
        setError(event.message as string);
        break;
      }
      case 'photo_saved': {
        // 后端已把照片存盘，把对话流里的 object URL 换成可持久访问的 /evidence/xxx
        const itemId = pendingPhotoItemIdRef.current;
        const photoUrl = event.photoUrl as string | undefined;
        if (itemId && photoUrl) {
          setTimeline(prev => prev.map(it =>
            it.id === itemId ? { ...it, imageUrl: photoUrl } : it
          ));
          pendingPhotoItemIdRef.current = null;
        }
        break;
      }
    }
  }, [finalizeStreamingMessage, pushItem]);

  useEffect(() => {
    handleEventRef.current = handleEvent;
  }, [handleEvent]);

  const doSend = useCallback(async (params: {
    type: 'text' | 'select_activity' | 'submit_text' | 'abandon';
    text?: string;
    activityId?: string;
    showUserMessage?: boolean;
    // 步骤实际耗时（秒），仅 submit_text 由软计时器带上
    elapsedSeconds?: number;
  }) => {
    if (!sessionId) return;

    if (activeRequestRef.current && abortRef.current) {
      abortRef.current.abort();
    }
    const ac = new AbortController();
    abortRef.current = ac;
    activeRequestRef.current = true;

    setIsStreaming(true);
    setError(null);
    setCompleted(false);

    // 乐观骨架：点选活动→立即铺步骤骨架；说"换一批"→立即铺活动骨架
    if (params.type === 'select_activity') setUiOptimistic('step');
    if (params.type === 'text' && params.text && REFRESH_RE.test(params.text)) setUiOptimistic('activities');

    if (params.type === 'text' && params.text && params.showUserMessage !== false) {
      pushUserText(params.text);
    }

    if (params.type === 'select_activity' && params.activityId) {
      // 从瀑布流最近一张活动卡里找标题，作为玩家的气泡回执
      let activityTitle: string | undefined;
      for (let i = timelineRef.current.length - 1; i >= 0; i--) {
        const it = timelineRef.current[i];
        if (it.kind === 'activities') {
          activityTitle = it.activities.find(a => a.id === params.activityId)?.title;
          break;
        }
      }
      if (activityTitle) pushUserText(`我选「${activityTitle}」`);
    }

    if (params.type === 'abandon') {
      pushUserText('不想做了...');
    }

    try {
      await sendMessage({
        sessionId,
        type: params.type,
        text: params.text,
        activityId: params.activityId,
        geo: geoCoordsRef.current ?? undefined,
        elapsedSeconds: params.elapsedSeconds,
        onEvent: handleEventRef.current,
        signal: ac.signal,
      });
    } catch (err) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('abort') || msg.includes('Abort')) return;
      setError(msg);
      setIsStreaming(false);
    } finally {
      activeRequestRef.current = false;
    }
  }, [sessionId, pushUserText]);

  const sendText = useCallback((text: string) => {
    if (isStreaming || !text.trim()) return;
    doSend({ type: 'text', text });
  }, [isStreaming, doSend]);

  const selectActivity = useCallback((activityId: string) => {
    if (isStreaming) return;
    doSend({ type: 'select_activity', activityId });
  }, [isStreaming, doSend]);

  const submitText = useCallback((text: string, elapsedSeconds?: number) => {
    if (isStreaming || !text.trim()) return;
    pushUserText(text);
    doSend({ type: 'submit_text', text, showUserMessage: false, elapsedSeconds });
  }, [isStreaming, doSend, pushUserText]);

  const submitPhoto = useCallback(async (file: File, description: string, elapsedSeconds?: number) => {
    if (isStreaming || !sessionId) return;

    if (activeRequestRef.current && abortRef.current) {
      abortRef.current.abort();
    }
    const ac = new AbortController();
    abortRef.current = ac;
    activeRequestRef.current = true;

    setIsStreaming(true);
    setError(null);

    const objectUrl = URL.createObjectURL(file);
    const photoItemId = uid();
    pendingPhotoItemIdRef.current = photoItemId;
    pushItem({ id: photoItemId, kind: 'user', content: `📷 ${description || '上传了一张照片'}`, imageUrl: objectUrl, timestamp: Date.now() });

    try {
      await sendPhoto(sessionId, file, description, handleEventRef.current, ac.signal, geoCoordsRef.current ?? undefined, elapsedSeconds);
    } catch (err) {
      if (ac.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('abort') || msg.includes('Abort')) return;
      setError(msg);
      setIsStreaming(false);
    } finally {
      activeRequestRef.current = false;
    }
  }, [isStreaming, sessionId, pushItem]);

  const abandon = useCallback(() => {
    if (isStreaming) return;
    doSend({ type: 'abandon' });
  }, [isStreaming, doSend]);

  const dismissCompletion = useCallback(() => {
    setCompleted(false);
    setReward(null);
  }, []);

  const refreshHandbook = useCallback(async () => {
    const v = await fetchHandbook(clientIdRef.current);
    if (v) setHandbook(v);
  }, []);

  // 保存喜好档案到长期记忆：PreferenceSheet 提交时调用，保存成功立即更新本地状态
  const saveUserProfile = useCallback(async (input: SaveProfileInput) => {
    const saved = await updateProfile(clientIdRef.current, input);
    if (saved) setProfile(saved);
  }, []);

  // 骨架屏：玩家点选/换一批的乐观态立即显示；否则按"UI 已挂起 + Agent 已开口引导"放行
  const uiSkeleton = uiOptimistic ?? (uiPending && uiGuided ? uiPending : null);

  return {
    started,
    sessionId,
    timeline,
    fsmState,
    isStreaming,
    isThinking,
    steppingText,
    uiSkeleton,
    isConnecting,
    error,
    completed,
    handbook,
    profile,
    questPairs,
    reward,
    quest,
    questHistory,
    proposedActivities,
    envInfo,
    geoSupported: geo.supported,
    geoStatus: geo.status,
    geoError: geo.error,
    requestGeo: geo.request,
    start,
    sendText,
    selectActivity,
    submitText,
    submitPhoto,
    abandon,
    dismissCompletion,
    refreshHandbook,
    saveUserProfile,
  };
}
