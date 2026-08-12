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

  const { default: PhotoSwipeLightbox } = await import('photoswipe/lightbox')
  const lightbox = new PhotoSwipeLightbox({
    dataSource: photos.map((photo) => ({
      src: photo.src,
      msrc: photo.thumb,
      width: photo.width,
      height: photo.height,
      alt: photo.alt,
      caption: photo.caption,
    })),
    pswpModule: () => import('photoswipe'),
    // Кадр открывается во всю ширину экрана, а не вписанным в него с полями по бокам:
    // яму разглядывают, а не рассматривают композицию. Сверх натурального размера
    // PhotoSwipe не растягивает ни при каком значении, поэтому мыла не будет.
    initialZoomLevel: 'fill',
    // Второй тап показывает кадр целиком: из «во всю ширину» иначе не выйти,
    // а на портретном снимке видна только его середина.
    secondaryZoomLevel: 'fit',
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
