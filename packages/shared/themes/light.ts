import type { StyleMapConfig } from "./types";

export const SCHEDULE_STYLEMAP_LIGHT: StyleMapConfig = {
  name: "light",
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
  lessonStyle: {
    headerStyle: "rounded-lg text-lg",
    barStyle: "",
    cardStyle: "bg-white rounded-lg px-1 py-2",
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
      headerStyle: "+ bg-green-400",
      barStyle: "+ bg-green-400",
    },
    Practice: {
      name: "Практика",
      headerStyle: "+ bg-red-400",
      barStyle: "+ bg-red-400",
    },
    Lab: {
      name: "Лабораторная",
      headerStyle: "+ bg-purple-500",
      barStyle: "+ bg-purple-500",
    },
    Other: {
      name: "Прочее",
      headerStyle: "+ bg-orange-400",
      barStyle: "+ bg-orange-400",
    },
    CourseWork: {
      name: "Курсовая",
      headerStyle: "hidden", // bg-pink-500
      barStyle: "+ bg-pink-500",
    },
    Consult: {
      name: "Консультация",
      headerStyle: "+ bg-blue-400",
      barStyle: "+ bg-blue-400",
    },
    Exam: {
      name: "Экзамен",
      headerStyle:
        "+ bg-black rounded-lg text-white outline-2 outline-white text-lg",
      barStyle: "+ bg-black",
    },
    Military: {
      name: "Военка",
      headerStyle: "hidden", // bg-orange-400
      barStyle: "+ bg-orange-400",
    },
    /*Test: {
      name: "Тест",
      headerStyle: "+ bg-gray-700 rounded-lg text-white hidden text-lg",
      barStyle: "+ bg-gray-700",
    },
    Military: {
      name: "Воен. Каф",
      headerStyle: "+ bg-green-600 rounded-lg hidden text-lg",
      barStyle: "+ bg-green-600",
    },*/
    Window: {
      name: "Окно",
      headerStyle: "hidden",
      barStyle: "hidden",
      cardStyle: "bg-white/90 rounded-lg", //border-black border-2 border-dashed
      nameStyle: "hidden",
    },
    Unknown: {
      name: "Неизвестно",
      headerStyle: "hidden",
      barStyle: "+ bg-black",
    },
  },
};
