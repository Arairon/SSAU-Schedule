import { StyleMap } from "./types";

export const SCHEDULE_STYLEMAP_DEFAULT: StyleMap = {
  general: {
    headerStyle: "bg-white rounded-lg",
    emptyWeek: {
      style: "bg-white rounded-lg text-center text-lg font-bold py-12",
      text: "Пар нет :D",
    },
  },
  lessonTypes: {
    Lection: {
      name: "Лекция",
      headerStyle: "bg-green-400 rounded-lg",
      barColor: "bg-green-400",
      cardStyle: "bg-white rounded-lg px-1 py-2",
      nameStyle: "font-bold capitalize",
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    },
    Practice: {
      name: "Практика",
      headerStyle: "bg-red-400 rounded-lg",
      barColor: "bg-red-400",
      cardStyle: "bg-white rounded-lg px-1 py-2",
      nameStyle: "font-bold capitalize",
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    },
    Lab: {
      name: "Лабораторная",
      headerStyle: "bg-purple-500 rounded-lg",
      barColor: "bg-purple-500",
      cardStyle: "bg-white rounded-lg px-1 py-2",
      nameStyle: "font-bold capitalize",
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    },
    Other: {
      name: "Прочее",
      headerStyle: "bg-orange-400 rounded-lg",
      barColor: "bg-orange-400",
      cardStyle: "bg-white rounded-lg px-1 py-2",
      nameStyle: "font-bold capitalize",
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    },
    CourseWork: {
      name: "Курсовая",
      headerStyle: "bg-pink-500 rounded-lg hidden",
      barColor: "bg-pink-500",
      cardStyle: "bg-white rounded-lg px-1 py-2",
      nameStyle: "font-bold capitalize",
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    },
    Consult: {
      name: "Консультация",
      headerStyle: "bg-blue-400 rounded-lg",
      barColor: "bg-blue-400",
      cardStyle: "bg-white rounded-lg px-1 py-2",
      nameStyle: "font-bold capitalize",
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    },
    Exam: {
      name: "Экзамен",
      headerStyle: "bg-black rounded-lg text-white outline-2 ountline-white",
      barColor: "bg-black",
      cardStyle: "bg-white rounded-lg px-1 py-2",
      nameStyle: "font-bold capitalize",
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    },
    Test: {
      name: "Тест",
      headerStyle: "bg-gray-700 rounded-lg text-white hidden",
      barColor: "bg-gray-700",
      cardStyle: "bg-white rounded-lg px-1 py-2",
      nameStyle: "font-bold capitalize",
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    },
    Military: {
      name: "Воен. Каф",
      headerStyle: "bg-green-600 rounded-lg hidden",
      barColor: "bg-green-600",
      cardStyle: "bg-white rounded-lg px-1 py-2",
      nameStyle: "font-bold capitalize",
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    },
    Window: {
      name: "Окно",
      headerStyle: "bg-white rounded-lg hidden",
      barColor: "",
      cardStyle: "bg-white/90 rounded-lg", //border-black border-2 border-dashed
      nameStyle: "hidden",
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    },
    Unknown: {
      name: "Неизвестно",
      headerStyle:
        "bg-white rounded-lg outline-purple-500 outline-2 outline-dashed hidden",
      barColor: "bg-black",
      cardStyle: "bg-white rounded-lg px-1 py-2",
      nameStyle: "font-bold capitalize",
      teacherStyle: "",
      placeStyle: "font-bold",
      subgroupStyle: "font-bold",
      groupListStyle:
        "text-xs grid grid-cols-2 grid-rows-2 grid-flow-col my-1 text-left",
    },
  },
};
