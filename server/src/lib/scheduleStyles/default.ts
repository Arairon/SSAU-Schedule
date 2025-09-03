import { type StyleMap } from "./types";

export const SCHEDULE_STYLEMAP_DEFAULT: StyleMap = {
  name: "default",
  description: "Светлая",
  general: {
    mainStyle: "gap-1 text-lg leading-5 text-center",
    headers: {
      main: "bg-white rounded-lg text-lg font-bold hidden",
      timeLabel: "bg-cyan-400",
      weekday: "bg-cyan-400",
      timeslot: "bg-cyan-200",
    },
    emptyWeek: {
      style: "bg-white rounded-lg text-center text-lg font-bold py-12",
      text: "Пар нет :D",
    },
  },
  lessonTypes: {
    Lection: {
      name: "Лекция",
      headerStyle: "bg-green-400 rounded-lg text-lg",
      barStyle: "bg-green-400",
      cardStyle: "bg-white rounded-lg px-1 py-2",
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
      headerStyle: "bg-red-400 rounded-lg text-lg",
      barStyle: "bg-red-400",
      cardStyle: "bg-white rounded-lg px-1 py-2",
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
      headerStyle: "bg-purple-500 rounded-lg text-lg",
      barStyle: "bg-purple-500",
      cardStyle: "bg-white rounded-lg px-1 py-2",
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
      headerStyle: "bg-orange-400 rounded-lg text-lg",
      barStyle: "bg-orange-400",
      cardStyle: "bg-white rounded-lg px-1 py-2",
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
    /*CourseWork: {
      name: "Курсовая",
      headerStyle: "bg-pink-500 rounded-lg hidden text-lg",
      barStyle: "bg-pink-500",
      cardStyle: "bg-white rounded-lg px-1 py-2",
      nameStyle: "font-bold", //capitalize
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
      ietStyle:
        "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
      ietLabel: "ИОТ",
    },*/
    Consult: {
      name: "Консультация",
      headerStyle: "bg-blue-400 rounded-lg text-lg",
      barStyle: "bg-blue-400",
      cardStyle: "bg-white rounded-lg px-1 py-2",
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
        "bg-black rounded-lg text-white outline-2 outline-white text-lg",
      barStyle: "bg-black",
      cardStyle: "bg-white rounded-lg px-1 py-2",
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
    Military: {
      name: "Военка",
      headerStyle: "bg-orange-400 rounded-lg text-lg hidden",
      barStyle: "bg-orange-400",
      cardStyle: "bg-white rounded-lg px-1 py-2",
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
    /*Test: {
      name: "Тест",
      headerStyle: "bg-gray-700 rounded-lg text-white hidden text-lg",
      barStyle: "bg-gray-700",
      cardStyle: "bg-white rounded-lg px-1 py-2",
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
    Military: {
      name: "Воен. Каф",
      headerStyle: "bg-green-600 rounded-lg hidden text-lg",
      barStyle: "bg-green-600",
      cardStyle: "bg-white rounded-lg px-1 py-2",
      nameStyle: "font-bold", //capitalize
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
      ietStyle:
        "font-bold outline-2 outline-slate-400 bg-slate-300 rounded-lg my-1 py-[0.25] px-2 text-slate-600",
      ietLabel: "ИОТ",
    },*/
    Window: {
      name: "Окно",
      headerStyle: "bg-white rounded-lg hidden text-lg",
      barStyle: "",
      cardStyle: "bg-white/90 rounded-lg", //border-black border-2 border-dashed
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
      cardStyle: "bg-white rounded-lg px-1 py-2",
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
