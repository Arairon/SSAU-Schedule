import type { StyleMapConfig } from "./types";

export const SCHEDULE_STYLEMAP_DARK: StyleMapConfig = {
  name: "dark",
  description: "Тёмная",
  general: {
    mainStyle: "gap-1 text-lg leading-5 text-center",
    headers: {
      main: "bg-slate-800 text-white border-2 border-slate-500 rounded-lg text-lg font-bold hidden",
      timeLabel: "bg-cyan-800 text-white",
      weekday: "bg-cyan-800 text-white",
      timeslot: "bg-cyan-900 text-white",
    },
    emptyWeek: {
      style:
        "border-2 border-slate-500 bg-slate-800 text-white rounded-lg text-center text-lg font-bold py-12",
      text: "Пар нет :D",
    },
  },
  lessonStyle: {
    headerStyle: "border-2 text-white rounded-lg text-lg",
    barStyle: "",
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
      barStyle: "+ bg-green-400",
      cardStyle: "+ border-slate-500 bg-slate-800",
    },
    Practice: {
      name: "Практика",
      headerStyle: "+ border-red-400 bg-red-950",
      barStyle: "+ bg-red-400",
      cardStyle: "+ border-slate-500 bg-slate-800",
    },
    Lab: {
      name: "Лабораторная",
      headerStyle: "+ border-purple-400 bg-purple-950",
      barStyle: "+ bg-purple-500",
      cardStyle: "+ border-slate-500 bg-slate-800",
    },
    Other: {
      name: "Прочее",
      headerStyle: "+ border-orange-400 bg-orange-950",
      barStyle: "+ bg-orange-400",
      cardStyle: "+ border-slate-500 bg-slate-800",
    },
    CourseWork: {
      name: "Курсовая",
      headerStyle: "+ border-pink-400 bg-pink-950  hidden",
      barStyle: "+ bg-pink-400",
      cardStyle: "+ border-slate-500 bg-slate-800",
    },
    Consult: {
      name: "Консультация",
      headerStyle: "+ border-blue-400 bg-blue-950",
      barStyle: "+ bg-blue-400 text-lg",
      cardStyle: "+ border-slate-500 bg-slate-800",
    },
    Exam: {
      name: "Экзамен",
      headerStyle: "+ border-white bg-black",
      barStyle: "+ bg-black text-lg",
      cardStyle: "+ border-slate-500 bg-slate-800",
    },
    Military: {
      name: "Военка",
      headerStyle: "+ border-orange-400 bg-orange-950  hidden",
      barStyle: "+ bg-orange-400",
      cardStyle: "+ border-slate-500 bg-slate-800",
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
      headerStyle: "hidden",
      barStyle: "+ bg-black",
      cardStyle: "+ border-slate-500 bg-slate-800",
    },
  },
};
