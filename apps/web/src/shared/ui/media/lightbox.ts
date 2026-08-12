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
  /** «До» или «После» — та же подпись, что лежит на плите страницы. В просмотрщике
   *  она обязательна: снимки листаются, и без неё непонятно, это яма или ремонт. */
  caption: string
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

  const sized = await Promise.all(photos.map(measure))
  const { default: PhotoSwipeLightbox } = await import('photoswipe/lightbox')
  const lightbox = new PhotoSwipeLightbox({
    dataSource: sized.map((photo) => ({
      src: photo.src,
      msrc: photo.thumb,
      width: photo.width,
      height: photo.height,
      alt: photo.alt,
      caption: photo.caption,
    })),
    pswpModule: () => import('photoswipe'),
    // Кадр открывается целиком и с полями, а не растянутым в экран: растянутый режет
    // верх и низ, а на снимке ямы важен как раз край выбоины.
    initialZoomLevel: 'fit',
    // Второй тап приближает: разглядеть трещину на общем плане иначе нельзя.
    secondaryZoomLevel: 'fill',
    // Поля вокруг кадра. Сверху больше остальных: там лежит подпись «до / после»,
    // и без запаса она встаёт прямо на снимок.
    padding: { top: 72, bottom: 40, left: 40, right: 40 },
    maxZoomLevel: 2,
    // Затемнение почти непрозрачное: под ним тёмная страница, и полупрозрачный фон
    // оставлял бы на снимке проступающую разметку заявки.
    bgOpacity: 0.94,
    zoom: true,
    close: true,
  })

  // Подпись сверху, а не снизу: снизу её закрывает палец, которым листают, а на плите
  // страницы «до» и «после» тоже стоят там, где их видно сразу.
  lightbox.on('uiRegister', () => {
    lightbox.pswp?.ui?.registerElement({
      name: 'caption',
      order: 9,
      isButton: false,
      appendTo: 'root',
      onInit: (element, pswp) => {
        element.className = 'pswp-caption'
        const render = (): void => {
          const data = pswp.currSlide?.data as { caption?: string } | undefined
          element.textContent = data?.caption ?? ''
        }
        pswp.on('change', render)
        render()
      },
    })
  })

  lightbox.init()
  lightbox.loadAndOpen(index)
}

/** Размеры без нуля. Ноль приходит от заявок, снятых до того, как API начал отдавать
 *  размеры, и от снимков, у которых их не проставил воркер. Без размеров PhotoSwipe
 *  считает масштаб «вписать» неверно и растягивает кадр на весь экран, поэтому такой
 *  снимок замеряется браузером — по сети это тот же файл, который всё равно грузится. */
async function measure(photo: LightboxPhoto): Promise<LightboxPhoto> {
  if (photo.width > 0 && photo.height > 0) return photo
  const image = new Image()
  image.src = photo.src
  await image.decode().catch(() => undefined)
  if (image.naturalWidth === 0) return photo
  return { ...photo, width: image.naturalWidth, height: image.naturalHeight }
}
