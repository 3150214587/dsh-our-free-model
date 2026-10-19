import * as React from 'react'
import { createSponsorUI } from '../../../src/sponsor.js'
import image from '../../../docs/images/sponsor-beichen-examples.jpg?inline'
import '../../../src/sponsor.css'

export const { SponsorPage, SponsorBanner } = createSponsorUI(React, image, 'desktop')
