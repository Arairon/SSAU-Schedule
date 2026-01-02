import { createFileRoute } from '@tanstack/react-router'
import { useTg } from '@/hooks/useTg';
import ScheduleViewer from '@/components/ScheduleViewer';
import { useQuery, useQueryClient, } from '@tanstack/react-query';
import { getSchedule } from '@/api/api';
import { getWeekFromDate } from '@shared/date';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon, ArrowRightIcon, LoaderCircleIcon, SearchIcon, SlidersHorizontalIcon, TriangleAlertIcon } from "lucide-react"
import { toast } from 'sonner';

export const Route = createFileRoute('/')({
  component: App,
})


// const testSchedule = ScheduleSchema.parse(JSON.parse('{"days":[{"week":16,"endTime":"2025-12-15T11:05:00.000Z","lessons":[{"id":4863493,"alts":[{"id":4891353,"alts":[],"room":"511","type":"Lab","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-15T05:35:00.000Z","teacher":"Лёзина Ирина Викторовна","building":"14","isOnline":false,"subgroup":2,"beginTime":"2025-12-15T04:00:00.000Z","discipline":"Обьектно-ориентированное программирование","dayTimeSlot":1,"conferenceUrl":null}],"room":"423","type":"Lab","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-15T05:35:00.000Z","teacher":"Кудрина Мария Александровна","building":"14","isOnline":false,"subgroup":1,"beginTime":"2025-12-15T04:00:00.000Z","discipline":"Компьютерная графика","dayTimeSlot":1,"conferenceUrl":"https://bbb.ssau.ru/b/ua4-dth-w3c"},{"id":4891365,"alts":[{"id":4863501,"alts":[],"room":"423","type":"Lab","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-15T07:20:00.000Z","teacher":"Кудрина Мария Александровна","building":"14","isOnline":false,"subgroup":1,"beginTime":"2025-12-15T05:45:00.000Z","discipline":"Компьютерная графика","dayTimeSlot":2,"conferenceUrl":"https://bbb.ssau.ru/b/ua4-dth-w3c"}],"room":"511","type":"Lab","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-15T07:20:00.000Z","teacher":"Лёзина Ирина Викторовна","building":"14","isOnline":false,"subgroup":2,"beginTime":"2025-12-15T05:45:00.000Z","discipline":"Обьектно-ориентированное программирование","dayTimeSlot":2,"conferenceUrl":null},{"id":4888335,"alts":[],"room":"430","type":"Practice","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-15T09:05:00.000Z","teacher":"Якуткина Галина Николаевна","building":"14","isOnline":false,"subgroup":null,"beginTime":"2025-12-15T07:30:00.000Z","discipline":"Теория вероятностей и случайных процессов","dayTimeSlot":3,"conferenceUrl":null},{"id":4937019,"alts":[],"room":"425","type":"Practice","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-15T11:05:00.000Z","teacher":"Максимов Валерий Владимирович","building":"14","isOnline":false,"subgroup":null,"beginTime":"2025-12-15T09:30:00.000Z","discipline":"Физика","dayTimeSlot":4,"conferenceUrl":null}],"weekday":1,"beginTime":"2025-12-15T04:00:00.000Z","lessonCount":4},{"week":16,"endTime":"2025-12-16T11:05:00.000Z","lessons":[{"id":4960557,"alts":[],"room":"513","type":"Lection","flows":[],"isIet":false,"groups":["6201-090301D","6202-090301D","6203-090301D"],"endTime":"2025-12-16T05:35:00.000Z","teacher":"Теряева Ольга Викторовна","building":"адм","isOnline":false,"subgroup":null,"beginTime":"2025-12-16T04:00:00.000Z","discipline":"Электротехника","dayTimeSlot":1,"conferenceUrl":"https://bbb.ssau.ru/b/dtv-paa-cre"},{"id":4984543,"alts":[{"id":4960564,"alts":[],"room":"407","type":"Lab","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-16T07:20:00.000Z","teacher":"Ивкина Маргарита Викторовна","building":"15","isOnline":false,"subgroup":1,"beginTime":"2025-12-16T05:45:00.000Z","discipline":"Иностранный  язык","dayTimeSlot":2,"conferenceUrl":"https://bbb.ssau.ru/b/eh7-zp2-a3e"}],"room":"409","type":"Lab","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-16T07:20:00.000Z","teacher":"Царёва Александра Владимировна","building":"15","isOnline":false,"subgroup":2,"beginTime":"2025-12-16T05:45:00.000Z","discipline":"Иностранный  язык","dayTimeSlot":2,"conferenceUrl":"https://bbb.ssau.ru/b/vhm-au6-w3j"},{"id":4932027,"alts":[{"id":4921669,"alts":[],"room":"407","type":"Lab","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-16T09:05:00.000Z","teacher":"Варфоломеева Вера Васильевна","building":"14","isOnline":false,"subgroup":2,"beginTime":"2025-12-16T07:30:00.000Z","discipline":"Основы безопасности жизнедеятельности","dayTimeSlot":3,"conferenceUrl":null}],"room":"101","type":"Lab","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-16T09:05:00.000Z","teacher":"Капитуров Андрей Евгеньевич","building":"адм","isOnline":false,"subgroup":1,"beginTime":"2025-12-16T07:30:00.000Z","discipline":"Электротехника","dayTimeSlot":3,"conferenceUrl":null},{"id":4932042,"alts":[{"id":4921673,"alts":[],"room":"407","type":"Lab","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-16T11:05:00.000Z","teacher":"Варфоломеева Вера Васильевна","building":"14","isOnline":false,"subgroup":2,"beginTime":"2025-12-16T09:30:00.000Z","discipline":"Основы безопасности жизнедеятельности","dayTimeSlot":4,"conferenceUrl":null}],"room":"101","type":"Lab","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-16T11:05:00.000Z","teacher":"Капитуров Андрей Евгеньевич","building":"адм","isOnline":false,"subgroup":1,"beginTime":"2025-12-16T09:30:00.000Z","discipline":"Электротехника","dayTimeSlot":4,"conferenceUrl":null}],"weekday":2,"beginTime":"2025-12-16T04:00:00.000Z","lessonCount":4},{"week":16,"endTime":"2025-12-17T11:05:00.000Z","lessons":[{"id":4906273,"alts":[],"room":"502","type":"Lection","flows":[],"isIet":false,"groups":["6201-090301D","6202-090301D","6203-090301D"],"endTime":"2025-12-17T05:35:00.000Z","teacher":"Варфоломеева Вера Васильевна","building":"14","isOnline":false,"subgroup":null,"beginTime":"2025-12-17T04:00:00.000Z","discipline":"Основы безопасности жизнедеятельности","dayTimeSlot":1,"conferenceUrl":null},{"id":4906266,"alts":[],"room":"502","type":"Lection","flows":[],"isIet":false,"groups":["6201-090301D","6202-090301D","6203-090301D"],"endTime":"2025-12-17T07:20:00.000Z","teacher":"Максимов Валерий Владимирович","building":"14","isOnline":false,"subgroup":null,"beginTime":"2025-12-17T05:45:00.000Z","discipline":"Физика","dayTimeSlot":2,"conferenceUrl":null},{"id":5060196,"alts":[],"room":"409","type":"Lab","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-17T09:05:00.000Z","teacher":"Капитуров Андрей Евгеньевич","building":"адм","isOnline":false,"subgroup":2,"beginTime":"2025-12-17T07:30:00.000Z","discipline":"Электротехника","dayTimeSlot":3,"conferenceUrl":null},{"id":5060197,"alts":[],"room":"409","type":"Lab","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-17T11:05:00.000Z","teacher":"Капитуров Андрей Евгеньевич","building":"адм","isOnline":false,"subgroup":2,"beginTime":"2025-12-17T09:30:00.000Z","discipline":"Электротехника","dayTimeSlot":4,"conferenceUrl":null}],"weekday":3,"beginTime":"2025-12-17T04:00:00.000Z","lessonCount":4},{"week":16,"endTime":"2025-12-18T14:35:00.000Z","lessons":[{"id":4777167,"alts":[],"room":"Спорткомплекс","type":"Practice","flows":[],"isIet":false,"groups":["6201-090301D","6202-090301D","6203-090301D","6204-090301D","6205-090301D","6206-090301D","6201-010302D","6202-010302D","6203-010302D","6204-010302D","6205-010302D"],"endTime":"2025-12-18T07:20:00.000Z","teacher":"Преподаватели Каф Физвоспитания","building":"6","isOnline":false,"subgroup":null,"beginTime":"2025-12-18T05:45:00.000Z","discipline":"Элективные курсы по физической культуре и спорту","dayTimeSlot":2,"conferenceUrl":null},{"id":4855946,"alts":[],"room":null,"type":"Lection","flows":[],"isIet":false,"groups":["6201-090301D","6202-090301D","6203-090301D","6204-090301D","6205-090301D","6206-090301D"],"endTime":"2025-12-18T11:05:00.000Z","teacher":"Кудрина Мария Александровна","building":null,"isOnline":true,"subgroup":null,"beginTime":"2025-12-18T09:30:00.000Z","discipline":"Компьютерная графика","dayTimeSlot":4,"conferenceUrl":"https://bbb.ssau.ru/b/ua4-dth-w3c"},{"id":4855910,"alts":[],"room":null,"type":"Lection","flows":[],"isIet":false,"groups":["6201-090301D","6202-090301D","6203-090301D","6204-090301D","6205-090301D","6206-090301D"],"endTime":"2025-12-18T12:50:00.000Z","teacher":"Лёзина Ирина Викторовна","building":null,"isOnline":true,"subgroup":null,"beginTime":"2025-12-18T11:15:00.000Z","discipline":"Обьектно-ориентированное программирование","dayTimeSlot":5,"conferenceUrl":"https://bbb.ssau.ru/b/2dx-mxx-pjn-b2n"},{"id":4888302,"alts":[],"room":null,"type":"Lection","flows":[],"isIet":false,"groups":["6201-090301D","6202-090301D","6203-090301D","6204-090301D","6205-090301D","6206-090301D"],"endTime":"2025-12-18T14:35:00.000Z","teacher":"Якуткина Галина Николаевна","building":null,"isOnline":true,"subgroup":null,"beginTime":"2025-12-18T13:00:00.000Z","discipline":"Теория вероятностей и случайных процессов","dayTimeSlot":6,"conferenceUrl":"https://us05web.zoom.us/j/6418291288?pwd=a1pELzV4YTZDK3BFekN0aFVsbFh3QT09"}],"weekday":4,"beginTime":"2025-12-18T05:45:00.000Z","lessonCount":4},{"week":16,"endTime":"2025-12-19T09:05:00.000Z","lessons":[{"id":4858625,"alts":[],"room":"419","type":"Lection","flows":[],"isIet":false,"groups":["6201-090301D","6202-090301D","6203-090301D"],"endTime":"2025-12-19T05:35:00.000Z","teacher":"Горелов Георгий Николаевич","building":"3","isOnline":false,"subgroup":null,"beginTime":"2025-12-19T04:00:00.000Z","discipline":"Математический анализ","dayTimeSlot":1,"conferenceUrl":"https://bbb.ssau.ru/b/4qz-ron-7ha-ssv"},{"id":4932186,"alts":[],"room":"101а","type":"Practice","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-19T07:20:00.000Z","teacher":"Теряева Ольга Викторовна","building":"адм","isOnline":false,"subgroup":null,"beginTime":"2025-12-19T05:45:00.000Z","discipline":"Электротехника","dayTimeSlot":2,"conferenceUrl":null},{"id":4959361,"alts":[],"room":"417","type":"Practice","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-19T09:05:00.000Z","teacher":"Первова Татьяна Геннадьевна","building":"7","isOnline":false,"subgroup":null,"beginTime":"2025-12-19T07:30:00.000Z","discipline":"Математический анализ","dayTimeSlot":3,"conferenceUrl":null}],"weekday":5,"beginTime":"2025-12-19T04:00:00.000Z","lessonCount":3},{"week":16,"endTime":"2025-12-20T12:50:00.000Z","lessons":[{"id":5004058,"alts":[],"room":"425","type":"Practice","flows":[],"isIet":false,"groups":["6201-090301D"],"endTime":"2025-12-20T12:50:00.000Z","teacher":"Кухорев Виталий Сергеевич","building":"14","isOnline":false,"subgroup":null,"beginTime":"2025-12-20T11:15:00.000Z","discipline":"История  России","dayTimeSlot":5,"conferenceUrl":"https://bbb.ssau.ru/b/201-fmu-osf-kh2"}],"weekday":6,"beginTime":"2025-12-20T11:15:00.000Z","lessonCount":1}],"week":16,"year":14,"weekId":16,"groupId":531023227}'))
function App() {
  const { parsed: _tgData, raw: rawTgInfo } = useTg();
  const today = new Date()
  const [weekNumber, setWeekNumber] = useState(getWeekFromDate(today));

  const { isLoading, data, error } = useQuery({
    queryKey: ["schedule", weekNumber],
    queryFn: () => getSchedule({ rawTgInfo: rawTgInfo!, week: weekNumber }),
    staleTime: 300_000,
    retry: 3,
    // enabled: !!rawTgInfo // TODO: Reenable in prod, since usage outside tg is only handled in dev right now.
  })

  const queryClient = useQueryClient();
  if (weekNumber < 52 && !error)
    queryClient.prefetchQuery({
      queryKey: ["schedule", weekNumber],
      queryFn: () => getSchedule({ rawTgInfo: rawTgInfo!, week: weekNumber + 1 }),
      staleTime: 300_000,
      retry: 1,
    })
  if (weekNumber > 1 && !error)
    queryClient.prefetchQuery({
      queryKey: ["schedule", weekNumber],
      queryFn: () => getSchedule({ rawTgInfo: rawTgInfo!, week: weekNumber - 1 }),
      staleTime: 300_000,
      retry: 1,
    })



  function getViewer() {
    if (isLoading && !error) {
      return (
        <div className='flex min-h-[50vh] flex-col items-center justify-center'>
          <LoaderCircleIcon size={64} className='animate-spin text-slate-400' />
        </div>
      )
    }

    if (!data) {
      return (
        <div className='flex flex-col items-center gap-2 py-16'>
          <TriangleAlertIcon size={64} className='text-red-400' />
          <a>Произошла ошибка</a>
          {error &&
            <a className='text-sm'>{error?.name}: {error?.message}</a>
          }
        </div>
      )
    }
    return <ScheduleViewer schedule={data} />
  }

  return (
    <div className="text-center">
      <main className="flex min-h-screen flex-col items-center justify-stretch bg-slate-800 py-2 text-[calc(10px+2vmin)] text-white">
        <div className='flex flex-row items-center justify-between gap-4 self-stretch px-4 sm:justify-evenly'>
          <div className='flex flex-1 flex-row justify-start gap-1'>
            <Button variant={"outline"} className='min-w-16 grow border-2 dark:border-slate-600 dark:bg-slate-900'
              onClick={() => setWeekNumber(weekNumber - 1)}>
              <ArrowLeftIcon /> <span className='hidden truncate sm:block'>Предыдущая</span>
            </Button>
            <Button variant={"outline"} className='border-2 dark:border-slate-600 dark:bg-slate-900'
              onClick={() => toast("Not implemented yet")}>
              <SearchIcon />
            </Button>
          </div>

          <a className=''>Неделя: {weekNumber}</a>

          <div className='flex flex-1 flex-row justify-end gap-1'>
            <Button variant={"outline"} className='border-2 dark:border-slate-600 dark:bg-slate-900'
              onClick={() => toast("Not implemented yet")}>
              <SlidersHorizontalIcon />
            </Button>
            <Button variant={"outline"} className='min-w-16 grow border-2 dark:border-slate-600 dark:bg-slate-900'
              onClick={() => setWeekNumber(weekNumber + 1)}>
              <span className='hidden truncate sm:block'>Следующая</span><ArrowRightIcon />
            </Button>
          </div>
        </div>
        {getViewer()}
      </main>
    </div>
  )
}
