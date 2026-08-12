import 'photoswipe/style.css'

/** Снимок для просмотрщика. Размеры полного кадра приходят из контракта
 *  (`ReportPhotoView`): без них PhotoSwipe открывается рывком — сначала пустой экран,
 *  потом прыжок в размер загруженного изображения. */
export interface LightboxPhoto {
  /** Полный кадр: его и разглядывают. */
  src: string
  /** Превью, уже нарисованное на странице. Показывается мгновенно, пока грузится полный. */
  thumb: string
  width: number
  height: number
  alt: string
}

/** Открывает снимки во весь экран: жест разведения пальцев, стрелки, Escape.
 *
 *  Раньше на полный кадр вела обычная ссылка в новую вкладку. Житель уходил со страницы
 *  заявки в файл на чужом домене и возвращался кнопкой «назад» — а разглядывать яму
 *  на телефоне надо с увеличением, ради этого фотографию и открывают.
 *
 *  Ядро PhotoSwipe приезжает **по требованию**, отдельным куском: на страницу, где
 *  снимок не открыли ни разу, не попадает ни байта из него (PRD §8.1). Обёртка тоже
 *  импортируется динамически — она нужна ровно в момент нажатия.
 *
 *  Экземпляр живёт одно открытие: PhotoSwipe после `destroy` не переиспользуется,
 *  а собственного состояния между показами у нас нет. */
export async function openLightbox(photos: readonly LightboxPhoto[], index: number): Promise<void> {
  if (photos.length === 0) return

  const { default: PhotoSwipeLightbox } = await import('photoswipe/lightbox')
  const lightbox = new PhotoSwipeLightbox({
    dataSource: photos.map((photo) => ({
      src: photo.src,
      msrc: photo.thumb,
      width: photo.width,
      height: photo.height,
      alt: photo.alt,
    })),
    pswpModule: () => import('photoswipe'),
    // Счётчик и стрелки нужны: снимков от двух до шести, и «до» с «после» листают.
    // Кнопку «поделиться» PhotoSwipe не рисует вовсе — своей у нас тоже нет.
    bgOpacity: 0.94,
    // Затемнение почти непрозрачное: под ним тёмная страница, и полупрозрачный фон
    // оставлял бы на снимке проступающую разметку заявки.
    zoom: true,
    close: true,
  })
  lightbox.init()
  lightbox.loadAndOpen(index)
  // Экземпляр уходит вместе с окном: он одноразовый, а держать его в памяти между
  // просмотрами значит держать и загруженное ядро на телефоне с 2 ГБ.
  lightbox.on('destroy', () => undefined)
}
