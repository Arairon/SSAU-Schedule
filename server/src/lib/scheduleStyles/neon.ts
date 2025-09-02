import { StyleMap } from "./types";

export const SCHEDULE_STYLEMAP_NEON: StyleMap = {
  name: "neon",
  description: "Неоновая",
  general: {
    mainStyle: "gap-1 text-lg leading-5 text-center",
    headers: {
      main: "bg-black text-white text-lg font-bold border-2 border-white rounded-lg",
      timeLabel: "border-2 border-cyan-600 bg-cyan-900 text-white",
      weekday: "border-2 border-cyan-600 bg-cyan-900 text-white",
      timeslot: "border-2 border-cyan-600 bg-cyan-900 text-white",
    },
    emptyWeek: {
      style:
        "border-2 border-white bg-black text-white rounded-lg text-center text-lg font-bold py-12",
      text: "Пар нет :D",
    },
  },
  lessonTypes: {
    Lection: {
      name: "Лекция",
      headerStyle:
        "border-2 border-green-400 bg-green-950 text-white rounded-lg text-lg",
      barStyle: "hidden",
      cardStyle:
        "border-2 border-green-400 bg-green-950 text-white rounded-lg px-1 py-2",
      nameStyle: "font-bold", //capitalize
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
      ietStyle:
        "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
      ietLabel: "ИОТ",
    },
    Practice: {
      name: "Практика",
      headerStyle: "border-2 border-red-400 bg-red-950 text-white rounded-lg",
      barStyle: "hidden text-lg",
      cardStyle:
        "border-2 border-red-400 bg-red-950 text-white rounded-lg px-1 py-2",
      nameStyle: "font-bold", //capitalize
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
      ietStyle:
        "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
      ietLabel: "ИОТ",
    },
    Lab: {
      name: "Лабораторная",
      headerStyle:
        "border-2 border-purple-400 bg-purple-950 text-white rounded-lg text-lg",
      barStyle: "hidden",
      cardStyle:
        "border-2 border-purple-400 bg-purple-950 text-white rounded-lg px-1 py-2",
      nameStyle: "font-bold", //capitalize
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
      ietStyle:
        "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
      ietLabel: "ИОТ",
    },
    Other: {
      name: "Прочее",
      headerStyle:
        "border-2 border-orange-400 bg-orange-950 text-white rounded-lg text-lg",
      barStyle: "hidden",
      cardStyle:
        "border-2 border-orange-400 bg-orange-950 text-white rounded-lg px-1 py-2",
      nameStyle: "font-bold", //capitalize
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
      ietStyle:
        "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
      ietLabel: "ИОТ",
    },
    Consult: {
      name: "Консультация",
      headerStyle:
        "border-2 border-blue-400 bg-blue-950 text-white rounded-lg text-lg",
      barStyle: "hidden text-lg",
      cardStyle:
        "border-2 border-blue-400 bg-blue-950 text-white rounded-lg px-1 py-2",
      nameStyle: "font-bold", //capitalize
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
      ietStyle:
        "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
      ietLabel: "ИОТ",
    },
    Exam: {
      name: "Экзамен",
      headerStyle:
        "border-2 border-white bg-black text-white rounded-lg text-lg",
      barStyle: "bg-black text-lg",
      cardStyle:
        "border-2 border-white bg-black text-white rounded-lg px-1 py-2",
      nameStyle: "font-bold", //capitalize
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
      ietStyle:
        "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
      ietLabel: "ИОТ",
    },
    Window: {
      name: "Окно",
      headerStyle: "bg-white rounded-lg hidden",
      barStyle: " text-lg",
      cardStyle:
        "border-2 border-slate-600 bg-slate-900 text-white rounded-lg px-1 py-2",
      nameStyle: "hidden",
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
      ietStyle:
        "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
      ietLabel: "ИОТ",
    },
    Unknown: {
      name: "Неизвестно",
      headerStyle:
        "bg-white rounded-lg outline-purple-500 outline-2 outline-dashed hidden text-lg",
      barStyle: "bg-black",
      cardStyle:
        "border-2 border-slate-500 bg-slate-800 text-white rounded-lg px-1 py-2",
      nameStyle: "font-bold", //capitalize
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
      ietStyle:
        "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
      ietLabel: "ИОТ",
    },
  },
};
