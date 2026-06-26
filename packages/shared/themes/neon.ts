import type { StyleMapConfig } from "./types";

export const SCHEDULE_STYLEMAP_NEON: StyleMapConfig = {
  name: "neon",
  description: "Неоновая",
  general: {
    mainStyle: "gap-1 text-lg leading-5 text-center",
    headers: {
      main: "bg-black text-white text-lg font-bold border-2 border-white rounded-lg hidden",
      timeLabel: "border-2 border-cyan-600 bg-cyan-900 text-white",
      weekday: "border-2 border-cyan-600 bg-cyan-900 text-white",
      timeslot: "border-2 border-cyan-600 bg-cyan-900 text-white",
    },
    emptyWeek: {
      style:
        "border-white bg-black text-white rounded-lg text-center text-lg font-bold py-12",
      text: "Пар нет :D",
    },
  },
  lessonStyle: {
    headerStyle: "border-2 text-white rounded-lg text-lg",
    barStyle: "hidden",
    cardStyle: "border-2 text-white rounded-lg px-1 py-2",
    nameStyle: "font-bold", //capitalize
    teacherStyle: "",
    placeStyle: "font-bold",
    subgroupStyle: "font-bold",
    groupListStyle: "text-sm my-1",
    ietStyle:
      "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
    ietLabel: "ИОТ",
  },
  lessonTypes: {
    Lection: {
      name: "Лекция",
      headerStyle: "+ border-green-400 bg-green-950",
      cardStyle: "+ border-green-400 bg-green-950",
    },
    Practice: {
      name: "Практика",
      headerStyle: "+ border-red-400 bg-red-950",
      cardStyle: "+ border-red-400 bg-red-950",
    },
    Lab: {
      name: "Лабораторная",
      headerStyle: "+ border-purple-400 bg-purple-950",
      cardStyle: "+ border-purple-400 bg-purple-950",
    },
    Other: {
      name: "Прочее",
      headerStyle: "+ border-yellow-400 bg-yellow-950",
      cardStyle: "+ border-yellow-400 bg-yellow-950",
    },
    CourseWork: {
      name: "Курсовая",
      headerStyle: "+ hidden", // border-pink-400 bg-pink-950
      cardStyle: "+ border-pink-400 bg-pink-950",
    },
    Consult: {
      name: "Консультация",
      headerStyle: "+ border-blue-400 bg-blue-950",
      cardStyle: "+ border-blue-400 bg-blue-950",
    },
    Exam: {
      name: "Экзамен",
      headerStyle: "+ border-white bg-black",
      cardStyle: "+ border-white bg-black",
    },
    Military: {
      name: "Военка",
      headerStyle: "+ hidden", // border-yellow-400 bg-yellow-950
      cardStyle: "+ border-yellow-400 bg-yellow-950",
    },
    Window: {
      name: "Окно",
      headerStyle: "hidden",
      barStyle: "hidden",
      cardStyle: "+ border-slate-600 bg-slate-900",
      nameStyle: "hidden",
    },
    Unknown: {
      name: "Неизвестно",
      headerStyle: "hidden", // bg-white rounded-lg outline-purple-500 outline-2 outline-dashed text-lg
      barStyle: "hidden",
      cardStyle: "+ border-slate-500 bg-slate-800",
    },
  },
};
