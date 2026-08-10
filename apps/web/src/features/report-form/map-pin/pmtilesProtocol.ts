import { Protocol } from 'pmtiles'

/** Регистрация протокола PMTiles внутри воркера MapLibre.
 *
 *  Тайлы разбирает воркер, а не главный поток, и протокол, объявленный через
 *  `addProtocol` рядом с картой, до него не доходит: воркер молча не может прочитать
 *  ни одного тайла, и карта остаётся пустой без единой ошибки в консоли.
 *  Файл целиком уезжает в воркер: MapLibre подгружает его туда по URL, а Vite собирает
 *  его вместе с pmtiles по `?worker&url`. */
;(self as unknown as { addProtocol: (name: string, load: unknown) => void }).addProtocol(
  'pmtiles',
  new Protocol().tile,
)
