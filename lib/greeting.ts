export type GreetingEvent = "visit" | "checkIn" | "checkOut" | "cancelCheckOut";

export type GreetingRecord = {
  workDate?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
};

export type GreetingWeather = {
  label: string;
  temperature?: number | null;
  apparentTemperature?: number | null;
  precipitation?: number | null;
  windSpeed?: number | null;
};

export type GreetingContext = {
  employeeName?: string | null;
  kstDate?: string | null;
  nowIso?: string | null;
  record?: GreetingRecord | null;
  records?: GreetingRecord[];
  teamCount?: number | null;
  taskCount?: number | null;
  doneCount?: number | null;
  weather?: GreetingWeather | null;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
};

type PreviousRecordFacts = {
  label: "어제" | "지난 근무일";
  record: GreetingRecord;
  workedMinutes: number | null;
  isAutoCheckout: boolean;
  isMissingCheckIn: boolean;
  isTooShort: boolean;
};

type GreetingProfile = {
  firstName: string;
  date: DateParts;
  today: string;
  weekdayLabel: string;
  status: "notStarted" | "working" | "finished";
  event: GreetingEvent;
  weather: GreetingWeather | null;
  streak: number;
  teamCount: number;
  taskCount: number;
  doneCount: number;
  workedMinutes: number | null;
  previous: PreviousRecordFacts | null;
  currentMissingCheckIn: boolean;
  currentTooShort: boolean;
};

const weekdayLabels = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

const fixedSpecialMessages: Record<string, string[]> = {
  "01-01": [
    "새해 첫날이네요. 올해 첫 업무도 가볍게 시작해봐요!",
    "새해네요. 거창하게 말고 오늘 할 일 하나부터 가보죠!",
  ],
  "02-14": ["밸런타인데이네요. 달달한 건 없더라도 일은 깔끔하게 가봐요!"],
  "03-01": ["삼일절이에요. 차분하게 마음 잡고 오늘도 힘내봐요."],
  "03-14": ["화이트데이네요. 오늘은 말도 일도 조금 부드럽게 가봐요!"],
  "04-01": ["만우절이에요. 장난은 가볍게, 기록은 정확하게 갑시다!"],
  "04-05": ["식목일이에요. 오늘 심는 작은 업무 하나가 나중에 커질 거예요."],
  "04-22": ["지구의 날이네요. 작은 일부터 깔끔하게 줄여봐요!"],
  "05-01": ["근로자의 날이에요. 일하는 사람답게 오늘도 멋지게 가봅시다!"],
  "05-05": ["어린이날이네요. 복잡한 일도 단순하게 하나씩 가봐요!"],
  "05-08": ["어버이날이에요. 바빠도 고마운 마음 하나는 챙겨가요."],
  "05-15": ["스승의 날이네요. 오늘 배운 건 바로 써먹어봅시다!"],
  "05-18": ["5.18 기념일이에요. 차분한 마음으로 오늘 할 일도 단단하게요."],
  "06-06": ["현충일이에요. 오늘은 차분하게, 해야 할 일부터 정리해봐요."],
  "06-10": ["6월 민주항쟁 기념일이에요. 오늘도 마음 단단히 잡고 가봐요."],
  "06-25": ["6.25 전쟁일이에요. 차분하게 하루를 시작해봅시다."],
  "07-17": ["제헌절이에요. 오늘은 원칙대로 깔끔하게 처리해봐요!"],
  "08-15": ["광복절이에요. 단단한 마음으로 오늘도 힘내봐요."],
  "09-10": ["세계 자살예방의 날이에요. 일도 중요하지만 마음도 꼭 챙겨요."],
  "10-03": ["개천절이에요. 오늘도 시작은 작게, 결과는 확실하게 가봐요!"],
  "10-09": ["한글날이에요. 메모도 보고도 오늘은 더 또렷하게 가봐요!"],
  "11-11": ["11월 11일이네요. 길게 고민 말고 한 줄로 정리하고 시작해요!"],
  "12-24": ["크리스마스이브네요. 조금만 더 힘내고 따뜻하게 마무리해요!"],
  "12-25": ["크리스마스네요. 메리 크리스마스! 오늘도 힘내요!"],
  "12-31": ["올해 마지막 날이에요. 마지막까지 깔끔하게 닫아봅시다!"],
};

const solarTermMessages: Record<string, string[]> = {
  "01-06": ["소한 무렵이에요. 추워도 오늘 할 일은 또렷하게 가봐요!"],
  "01-20": ["대한 무렵이에요. 겨울 끝판왕 날씨에도 출근이라니 대단해요!"],
  "02-04": ["입춘 무렵이에요. 봄 시작처럼 일도 가볍게 열어봐요!"],
  "02-19": ["우수 무렵이에요. 얼어 있던 일도 하나씩 풀어봅시다!"],
  "03-05": ["경칩 무렵이에요. 잠깐 미뤄둔 일도 깨워볼 때예요!"],
  "03-20": ["춘분 무렵이에요. 오늘은 균형 잡고 차분히 가봐요."],
  "04-04": ["청명 무렵이에요. 머리도 책상도 조금 맑게 정리해봐요!"],
  "04-20": ["곡우 무렵이에요. 차분히 쌓는 일이 힘을 낼 때예요."],
  "05-05": ["입하 무렵이에요. 여름 기운처럼 업무도 슬슬 속도 내봐요!"],
  "05-21": ["소만 무렵이에요. 작게 쌓은 일들이 힘을 내는 때예요."],
  "06-05": ["망종 무렵이에요. 미뤄둔 씨앗 같은 일 하나 심어봐요!"],
  "06-21": ["하지 무렵이에요. 낮이 긴 만큼 오늘도 한 칸 더 가봅시다!"],
  "07-07": ["소서 무렵이에요. 더워도 물 챙기고 하나씩 가봐요!"],
  "07-23": ["대서 무렵이에요. 날씨가 세도 페이스는 잃지 말아요!"],
  "08-07": ["입추 무렵이에요. 더위 속에서도 가을 준비하듯 정리해봐요."],
  "08-23": ["처서 무렵이에요. 더위도 일도 조금씩 정리해봅시다!"],
  "09-07": ["백로 무렵이에요. 가을 리듬으로 오늘 할 일 잡아봐요."],
  "09-23": ["추분 무렵이에요. 오늘은 균형 있게, 무리 없이 가요."],
  "10-08": ["한로 무렵이에요. 쌀쌀해지는 만큼 몸도 일도 잘 챙겨요."],
  "10-24": ["상강 무렵이에요. 마감감 있게 하나씩 닫아봅시다!"],
  "11-07": ["입동 무렵이에요. 겨울 들어서기 전에 일도 정리해봐요!"],
  "11-22": ["소설 무렵이에요. 작은 눈처럼 작은 완료부터 쌓아봐요!"],
  "12-07": ["대설 무렵이에요. 추워도 오늘 할 일은 깔끔하게 가봐요!"],
  "12-22": ["동지 무렵이에요. 긴 밤 지나듯 일도 하나씩 넘겨봐요!"],
};

const yearSpecificMessages: Record<string, string[]> = {
  "2026-02-16": ["설 연휴 시작이네요. 연휴 전 할 일만 딱 닫아봐요!"],
  "2026-02-17": ["설날이에요. 새해 복 많이 받고 오늘도 힘내요!"],
  "2026-02-18": ["설 연휴 마지막 날이에요. 다시 리듬 잡아봅시다!"],
  "2026-03-02": ["삼일절 대체공휴일이에요. 쉬는 날에도 열일이라니 대단해요!"],
  "2026-05-24": ["부처님오신날이에요. 마음은 차분하게, 일은 가볍게요."],
  "2026-05-25": ["대체공휴일이에요. 쉬는 날에도 나오셨네요, 힘내세요!"],
  "2026-06-03": ["지방선거일이에요. 오늘 일정도 투표하듯 확실히 선택해봐요!"],
  "2026-08-17": ["광복절 대체공휴일이에요. 쉬는 날 출근, 진짜 열일하시네요!"],
  "2026-09-24": ["추석 연휴 시작이네요. 연휴 전 마무리만 깔끔하게요!"],
  "2026-09-25": ["추석이에요. 풍성한 마음으로 오늘도 힘내요!"],
  "2026-09-26": ["추석 연휴 마지막 날이에요. 천천히 리듬 다시 잡아봐요."],
  "2026-10-05": ["개천절 대체공휴일이에요. 쉬는 날에도 나오셨네요, 힘내요!"],
};

const genericWorkNudges = [
  "오늘도 가보죠!",
  "힘내봅시다!",
  "하나씩 부숴봅시다!",
  "오늘도 열일 가보죠!",
  "할 일 하나씩 깔끔하게 가요!",
  "첫 업무부터 가볍게 열어봐요!",
  "작게 시작해서 확실하게 닫아봐요!",
];

export function createLocalGreeting(context: GreetingContext, event: GreetingEvent = "visit") {
  return createLocalGreetings(context, event, 1)[0];
}

export function createLocalGreetings(
  context: GreetingContext,
  event: GreetingEvent = "visit",
  count = 6,
) {
  const profile = buildProfile(context, event);
  const candidates = buildGreetingCandidates(profile);
  const shortCandidates = candidates.filter((message) => message.length <= 76);
  return pickManyUnique(shortCandidates.length ? shortCandidates : candidates, count).map(cleanup);
}

export function buildGreetingFacts(context: GreetingContext) {
  const profile = buildProfile(context, "visit");
  return {
    date: profile.today,
    weekday: profile.weekdayLabel,
    weather: profile.weather,
    streak: profile.streak,
    teamCount: profile.teamCount,
    taskCount: profile.taskCount,
    doneCount: profile.doneCount,
    workedMinutes: profile.workedMinutes,
    previous: profile.previous,
    status: profile.status,
  };
}

function buildProfile(context: GreetingContext, event: GreetingEvent): GreetingProfile {
  const date = getKstParts(context.nowIso ? new Date(context.nowIso) : new Date(), context.kstDate);
  const today = toDateString(date);
  const record = context.record ?? null;
  const status = record?.checkOutAt ? "finished" : record?.checkInAt ? "working" : "notStarted";
  const workedMinutes = getWorkedMinutes(record);

  return {
    firstName: getFirstName(context.employeeName ?? ""),
    date,
    today,
    weekdayLabel: weekdayLabels[date.weekday],
    status,
    event,
    weather: context.weather ?? null,
    streak: getAttendanceStreak(context.records ?? [], today),
    teamCount: Math.max(0, context.teamCount ?? 0),
    taskCount: Math.max(0, context.taskCount ?? 0),
    doneCount: Math.max(0, context.doneCount ?? 0),
    workedMinutes,
    previous: getPreviousRecordFacts(context.records ?? [], today),
    currentMissingCheckIn: Boolean(record?.checkOutAt && !record.checkInAt),
    currentTooShort: workedMinutes !== null && workedMinutes <= 30,
  };
}

function buildGreetingCandidates(profile: GreetingProfile) {
  const candidates: string[] = [];
  const add = (messages: string[], weight = 1) => {
    for (let count = 0; count < weight; count += 1) {
      candidates.push(...messages);
    }
  };

  add(getEventMessages(profile), 2);
  add(getRecordCareMessages(profile), 3);
  add(getWeatherMessages(profile), 2);
  add(getSpecialMessages(profile), 2);
  add(getWeekendMessages(profile), 2);
  add(getTimeMessages(profile), 2);
  add(getWeekdayMessages(profile));
  add(getWorkloadMessages(profile));
  add(getTeamMessages(profile));
  add(getGenericMessages(profile));

  return candidates.length ? candidates : [`${profile.firstName}님, 오늘도 힘내봅시다!`];
}

function getEventMessages(profile: GreetingProfile) {
  if (profile.event === "checkIn") {
    return [
      `출근 완료! 지금 ${formatClock(profile.date)}네요. 오늘도 가보죠!`,
      `${profile.firstName}님 출근 완료! 첫 업무부터 가볍게 열어봐요.`,
      `출근 찍혔어요. 오늘도 하나씩 부숴봅시다!`,
    ];
  }

  if (profile.event === "checkOut") {
    if (profile.currentMissingCheckIn) {
      return [
        "출근 기록을 깜빡하셨네요. 다음엔 출근하자마자 버튼부터요!",
        "퇴근은 찍혔어요. 다음엔 출근 기록도 바로 챙겨봅시다!",
      ];
    }

    return [
      "퇴근 완료! 오늘도 고생하셨어요.",
      ...(profile.workedMinutes !== null
        ? [`오늘 ${formatDuration(profile.workedMinutes)} 근무하셨네요. 고생 많았어요!`]
        : []),
      `${profile.firstName}님, 퇴근 기록까지 깔끔해요. 고생 많았어요!`,
      "오늘 업무 마무리네요. 이제 쉬는 쪽으로 넘어가요!",
    ];
  }

  if (profile.event === "cancelCheckOut") {
    return [
      "퇴근 기록 다시 열어뒀어요. 남은 일 하나씩만 처리해봐요.",
      "다시 업무 모드네요. 급하게 말고 필요한 것부터 가요.",
    ];
  }

  return [];
}

function getRecordCareMessages(profile: GreetingProfile) {
  const messages: string[] = [];
  const previous = profile.previous;

  if (profile.currentMissingCheckIn) {
    messages.push("출근 기록 없이 퇴근만 남았네요. 다음엔 출근 버튼부터 챙겨요!");
  }

  if (profile.currentTooShort && profile.status === "finished") {
    messages.push(
      `오늘 출퇴근 간격이 ${formatDuration(profile.workedMinutes ?? 0)}이에요. 다음엔 출근 기록부터요!`,
    );
  }

  if (!previous) return messages;

  if (previous.isAutoCheckout) {
    messages.push(`${previous.label} 퇴근이 23시 59분으로 정리됐네요. 오늘은 꼭 찍고 가세요!`);
  }

  if (previous.isMissingCheckIn) {
    messages.push(`${previous.label} 출근 기록이 비어 있어요. 오늘은 출근 버튼부터 챙겨요!`);
  }

  if (previous.isTooShort) {
    messages.push(
      `${previous.label} 출퇴근 간격이 ${formatDuration(previous.workedMinutes ?? 0)}이에요. 다음엔 출근 기록부터요!`,
    );
  }

  if (previous.workedMinutes !== null && previous.workedMinutes >= 12 * 60) {
    const duration = formatDuration(previous.workedMinutes);
    messages.push(`${previous.label} ${duration} 일하셨네요. 오늘은 페이스 챙기면서 가요!`);
    messages.push(`${previous.label} 근무시간 ${duration}, 진짜 열일하셨네요. 오늘도 가보죠!`);
  } else if (previous.workedMinutes !== null && previous.workedMinutes >= 10 * 60) {
    messages.push(`${previous.label} ${formatDuration(previous.workedMinutes)} 일하셨네요. 오늘은 하나씩 가요!`);
  }

  if (profile.streak >= 10) {
    messages.push(`와, ${profile.streak}일 연속 출근이네요. 꾸준함 진짜 대단해요!`);
  } else if (profile.streak >= 5) {
    messages.push(`와, ${profile.streak}일 연속 출근이네요. 대단해요, 오늘도 가보죠!`);
  } else if (profile.streak >= 3) {
    messages.push(`${profile.streak}일 연속 출근 중이네요. 흐름 좋습니다!`);
  }

  return messages;
}

function getWeatherMessages(profile: GreetingProfile) {
  const weather = profile.weather;
  if (!weather) return [];

  const apparentTemp = weather.apparentTemperature ?? null;
  const temperature = weather.temperature ?? null;
  const temp = apparentTemp ?? temperature ?? NaN;
  const tempText = getTemperaturePhrase(apparentTemp, temperature);
  const tempSentence = tempText ? `${tempText}예요` : "";

  if (weather.label === "rain") {
    return [
      "광진구에 비가 오네요. 우산 챙기셨나요?",
      tempSentence ? `광진구는 비가 오고 ${tempSentence}. 우산 챙겨요!` : "",
      "비 오는 광진구네요. 이동 조심하고 오늘도 힘내요!",
    ].filter(Boolean);
  }

  if (weather.label === "snow") {
    return [
      "광진구에 눈 소식이 있네요. 미끄러지지 않게 조심해요!",
      tempSentence ? `광진구는 눈 소식이고 ${tempSentence}. 따뜻하게 챙겨요!` : "",
      "눈 오는 날 출근이라니 대단해요. 오늘도 힘내세요!",
    ].filter(Boolean);
  }

  if (Number.isFinite(temp) && temp >= 30) {
    return [
      `광진구는 ${tempSentence}. 날씨가 미쳤네요, 물 꼭 챙겨요!`,
      `와, ${tempText}라니 너무 덥죠? 시원한 물 마시고 가요!`,
    ];
  }

  if (Number.isFinite(temp) && temp <= -5) {
    return [
      `광진구는 ${tempSentence}. 진짜 춥네요, 따뜻하게 챙겨요!`,
      `와, ${tempText}라니 손 시리겠어요. 따뜻하게 가봅시다!`,
    ];
  }

  if (weather.label === "hot") {
    return [
      tempSentence
        ? `오늘 광진구는 ${tempSentence}. 물 한 잔 마시고 시작해요!`
        : "오늘 광진구 덥네요. 물 한 잔 마시고 시작해요!",
    ];
  }

  if (weather.label === "cold") {
    return [
      tempSentence
        ? `오늘 광진구는 ${tempSentence}. 몸부터 데우고 시작해요!`
        : "오늘 광진구 쌀쌀하네요. 몸부터 데우고 시작해요!",
    ];
  }

  if (weather.label === "windy") {
    return [
      weather.windSpeed !== null && weather.windSpeed !== undefined
        ? `광진구 바람 ${Math.round(weather.windSpeed)}km/h예요. 마음은 딱 붙잡고 가봐요!`
        : "광진구 바람이 부네요. 마음은 딱 붙잡고 가봐요!",
    ];
  }

  if (weather.label === "clear") {
    return [
      tempSentence
        ? `광진구는 맑고 ${tempSentence}. 기분 좋게 오늘도 가보죠!`
        : "광진구 하늘 맑네요. 기분 좋게 오늘도 가보죠!",
    ];
  }

  if (weather.label === "cloudy") {
    return [
      tempSentence
        ? `광진구는 흐리고 ${tempSentence}. 그래도 할 일은 또렷하게요!`
        : "광진구가 흐리네요. 그래도 할 일은 또렷하게 가봅시다!",
    ];
  }

  return [];
}

function getSpecialMessages(profile: GreetingProfile) {
  const key = `${String(profile.date.month).padStart(2, "0")}-${String(profile.date.day).padStart(2, "0")}`;
  const dateKey = profile.today;
  const messages = [
    ...(yearSpecificMessages[dateKey] ?? []),
    ...(fixedSpecialMessages[key] ?? []),
    ...(solarTermMessages[key] ?? []),
  ];

  if (profile.date.day === 1) {
    messages.push(`${profile.date.month}월 첫날이네요. 이번 달도 힘내봅시다!`);
  }
  if (profile.date.day === 10) {
    messages.push("벌써 10일이네요. 초반 페이스 한번 잡아봅시다!");
  }
  if (profile.date.day === 15) {
    messages.push("한 달의 가운데네요. 오늘도 하나씩 밀어봐요!");
  }
  if (profile.date.day >= getLastDayOfMonth(profile.date.year, profile.date.month) - 1) {
    messages.push(`${profile.date.month}월도 거의 끝이네요. 마무리까지 힘내요!`);
  }
  if (profile.date.month === 3 && profile.date.day === 31) {
    messages.push("1분기 마지막 날이에요. 끝까지 깔끔하게 닫아봐요!");
  }
  if (profile.date.month === 6 && profile.date.day === 30) {
    messages.push("상반기 마지막 날이에요. 오늘 마무리 제대로 가봅시다!");
  }
  if (profile.date.month === 9 && profile.date.day === 30) {
    messages.push("3분기 마지막 날이에요. 정리할 건 딱 정리해봐요!");
  }

  return messages;
}

function getWeekendMessages(profile: GreetingProfile) {
  if (profile.date.weekday === 6) {
    return [
      "토요일에도 나오셨네요. 진짜 열일하시네요, 힘내세요!",
      "주말 출근이라니 대단해요. 오늘은 필요한 것만 딱 끝내봐요!",
    ];
  }

  if (profile.date.weekday === 0) {
    return [
      "일요일에도 나오셨네요. 열정 인정입니다, 힘내세요!",
      "주말 마지막 날에도 열일이네요. 오늘도 가볍게 가봐요!",
    ];
  }

  return [];
}

function getTimeMessages(profile: GreetingProfile) {
  const hour = profile.date.hour;
  const time = formatClock(profile.date);

  if (hour < 6) {
    return [`지금 ${time}네요. 새벽까지 대단해요, 무리는 말고요!`];
  }
  if (hour < 9) {
    return [`지금 ${time}네요. 아침부터 부지런하시네요, 힘내요!`];
  }
  if (hour < 12) {
    return [`지금 ${time}네요. 오전 집중 타임, 오늘도 가보죠!`];
  }
  if (hour < 14) {
    return [`지금 ${time}, 점심시간대네요. 밥 든든히 먹고 오후도 가봅시다!`];
  }
  if (hour < 18) {
    return [`지금 ${time}네요. 오후도 조금만 더 밀어봐요!`];
  }
  if (hour < 21) {
    return [`벌써 ${time}네요. 마무리까지 조금만 더 힘내요!`];
  }
  return [`지금 ${time}네요. 늦게까지 고생 많아요, 꼭 퇴근 찍고 가요!`];
}

function getWeekdayMessages(profile: GreetingProfile) {
  if (profile.date.weekday === 1) {
    return [
      "월요일부터 열일하시네요. 이번 주도 힘내봅시다!",
      "월요일이에요. 첫 단추만 잘 끼우면 이번 주도 갑니다!",
    ];
  }
  if (profile.date.weekday === 2) {
    return ["화요일이네요. 어제보다 한 칸만 더 가봅시다!"];
  }
  if (profile.date.weekday === 3) {
    return ["수요일이에요. 주중 고비, 오늘만 잘 넘겨봐요!"];
  }
  if (profile.date.weekday === 4) {
    return ["목요일이네요. 슬슬 마무리 각 잡아봅시다!"];
  }
  if (profile.date.weekday === 5) {
    return [
      "금요일이에요. 마무리만 잘하면 주말입니다!",
      "불금 전 마지막 업무 타임이네요. 조금만 더 힘내요!",
    ];
  }
  return [];
}

function getWorkloadMessages(profile: GreetingProfile) {
  const messages: string[] = [];
  if (profile.taskCount >= 1 && profile.doneCount === profile.taskCount) {
    messages.push(`오늘 할 일 ${profile.taskCount}개 다 끝났네요. 멋져요!`);
  } else if (profile.taskCount >= 7) {
    messages.push(`오늘 할 일이 ${profile.taskCount}개네요. 전부 보지 말고 하나씩 부숴요!`);
  } else if (profile.taskCount >= 3) {
    messages.push(`오늘 할 일 ${profile.taskCount}개네요. 순서대로만 가면 됩니다!`);
  } else if (profile.taskCount === 0) {
    messages.push("오늘 할 일 아직 비어 있네요. 첫 줄만 적고 시작해봐요!");
  }

  if (profile.doneCount >= 5) {
    messages.push(`벌써 ${profile.doneCount}개 완료했네요. 오늘 폼 좋습니다!`);
  }

  return messages;
}

function getTeamMessages(profile: GreetingProfile) {
  if (profile.teamCount >= 8) {
    return [`오늘 동료 ${profile.teamCount}명도 같이 출근했네요. 다 같이 힘내봅시다!`];
  }
  if (profile.teamCount >= 3) {
    return [`오늘 동료 ${profile.teamCount}명도 함께네요. 같이 가보죠!`];
  }
  return [];
}

function getGenericMessages(profile: GreetingProfile) {
  return [
    `${profile.firstName}님, ${pick(genericWorkNudges)}`,
    `오늘도 출근부 켜셨네요. ${pick(genericWorkNudges)}`,
    `${profile.weekdayLabel}도 열일 모드네요. ${pick(genericWorkNudges)}`,
  ];
}

function getPreviousRecordFacts(records: GreetingRecord[], today: string): PreviousRecordFacts | null {
  const previousRecord = records
    .filter((record) => record.workDate && record.workDate < today)
    .sort((a, b) => (b.workDate ?? "").localeCompare(a.workDate ?? ""))[0];

  if (!previousRecord?.workDate) return null;

  const previousCalendarDay = addDaysToDateString(today, -1);
  const workedMinutes = getWorkedMinutes(previousRecord);

  return {
    label: previousRecord.workDate === previousCalendarDay ? "어제" : "지난 근무일",
    record: previousRecord,
    workedMinutes,
    isAutoCheckout: Boolean(previousRecord.checkInAt && isKstTime(previousRecord.checkOutAt, 23, 59)),
    isMissingCheckIn: Boolean(previousRecord.checkOutAt && !previousRecord.checkInAt),
    isTooShort: workedMinutes !== null && workedMinutes <= 30,
  };
}

function getAttendanceStreak(records: GreetingRecord[], today: string) {
  const workedDates = new Set(
    records
      .filter((record) => record.workDate && (record.checkInAt || record.checkOutAt))
      .map((record) => record.workDate as string),
  );

  let cursor = workedDates.has(today) ? today : previousWorkDate(today);
  let count = 0;

  while (workedDates.has(cursor)) {
    count += 1;
    cursor = previousWorkDate(cursor);
    if (count >= 60) break;
  }

  return count;
}

function getWorkedMinutes(record?: GreetingRecord | null) {
  if (!record?.checkInAt || !record.checkOutAt) return null;
  const checkIn = new Date(record.checkInAt).getTime();
  const checkOut = new Date(record.checkOutAt).getTime();
  if (!Number.isFinite(checkIn) || !Number.isFinite(checkOut) || checkOut <= checkIn) return null;
  return Math.round((checkOut - checkIn) / 60000);
}

function isKstTime(value: string | null | undefined, hour: number, minute: number) {
  if (!value) return false;
  const parts = getKstParts(new Date(value));
  return parts.hour === hour && parts.minute === minute;
}

function getKstParts(date: Date, dateOverride?: string | null): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const [overrideYear, overrideMonth, overrideDay] = dateOverride?.split("-").map(Number) ?? [];
  const year = overrideYear || Number(get("year"));
  const month = overrideMonth || Number(get("month"));
  const day = overrideDay || Number(get("day"));

  return {
    year,
    month,
    day,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

function previousWorkDate(value: string) {
  let cursor = value;
  do {
    cursor = addDaysToDateString(cursor, -1);
  } while (dateStringToUtcDate(cursor).getUTCDay() === 0 || dateStringToUtcDate(cursor).getUTCDay() === 6);
  return cursor;
}

function addDaysToDateString(value: string, days: number) {
  const date = dateStringToUtcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateStringToUtcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateString(date: DateParts) {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function formatClock(date: DateParts) {
  return `${date.hour}시 ${String(date.minute).padStart(2, "0")}분`;
}

function formatDuration(minutes: number) {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;

  if (hours === 0) return `${restMinutes}분`;
  if (restMinutes === 0) return `${hours}시간 00분`;
  return `${hours}시간 ${String(restMinutes).padStart(2, "0")}분`;
}

function formatTemperature(value: number) {
  return `${value.toFixed(1)}도`;
}

function getTemperaturePhrase(apparentTemperature: number | null, temperature: number | null) {
  if (apparentTemperature !== null && Number.isFinite(apparentTemperature)) {
    return `체감 ${formatTemperature(apparentTemperature)}`;
  }

  if (temperature !== null && Number.isFinite(temperature)) {
    return `기온 ${formatTemperature(temperature)}`;
  }

  return "";
}

function getLastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getFirstName(name: string) {
  const compact = name.normalize("NFC").replace(/\s+/g, "");
  if (!compact) return "오늘의 동료";
  return compact.length <= 3 ? compact : compact.slice(-3);
}

function cleanup(value: string) {
  return value.replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickManyUnique<T>(items: T[], count: number) {
  const uniqueItems = [...new Set(items)];
  const shuffled = [...uniqueItems].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.max(1, Math.min(count, shuffled.length)));
}
