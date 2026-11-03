import type { Page, Locator } from '@playwright/test';

export class FlowPage {
  readonly page: Page;
  readonly mainHeading: Locator;
  readonly aboutMeHeading: Locator;
  readonly introHeading: Locator;
  readonly experienceHeading: Locator;
  readonly mobileAppDevHeading: Locator;
  readonly networkTechHeading: Locator;
  readonly digitalExperiencesHeading: Locator;
  readonly webMobileHeading: Locator;
  readonly uiUxDesignHeading: Locator;
  readonly dataNetworkHeading: Locator;
  readonly softSkillsHeading: Locator;
  readonly selectedWorksHeading: Locator;
  readonly digitalVillageHeading: Locator;
  readonly seafarerLogisticHeading: Locator;
  readonly phyfullestHeading: Locator;
  readonly motorsportHeading: Locator;
  readonly nutriLogicHeading: Locator;
  readonly fruitMarketHeading: Locator;
  readonly romaMalkistHeading: Locator;
  readonly mentengStreetHeading: Locator;
  readonly licensesHeading: Locator;
  readonly mtcnaHeading: Locator;
  readonly dataAnalystHeading: Locator;
  readonly uiUxNonDesignersHeading: Locator;
  readonly juaraVibeCodingHeading: Locator;
  readonly reachOutHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.mainHeading = page.getByRole('heading', { name: 'Muhammad Zamzari Alfi Syahrin' });
    this.aboutMeHeading = page.getByRole('heading', { name: 'About Me' });
    this.introHeading = page.getByRole('heading', { name: 'I AM ZAMZARI ALFI' });
    this.experienceHeading = page.getByRole('heading', { name: 'Experience', exact: true });
    this.mobileAppDevHeading = page.getByRole('heading', { name: 'Mobile App Developer' });
    this.networkTechHeading = page.getByRole('heading', { name: 'Network Technician (FTTH & RT/RW Net)' });
    this.digitalExperiencesHeading = page.getByRole('heading', { name: /I BUILD DIGITAL EXPERIENCES/i });
    this.webMobileHeading = page.getByRole('heading', { name: 'Web & Mobile' });
    this.uiUxDesignHeading = page.getByRole('heading', { name: 'UI/UX Design' });
    this.dataNetworkHeading = page.getByRole('heading', { name: 'Data & Network' });
    this.softSkillsHeading = page.getByRole('heading', { name: 'Soft Skills' });
    this.selectedWorksHeading = page.getByRole('heading', { name: 'Selected Works' });
    this.digitalVillageHeading = page.getByRole('heading', { name: 'Digital Village Dashboard' });
    this.seafarerLogisticHeading = page.getByRole('heading', { name: 'Seafarer Logistic Company Profile' });
    this.phyfullestHeading = page.getByRole('heading', { name: 'Phyfullest Fashion Showcase' });
    this.motorsportHeading = page.getByRole('heading', { name: 'Motorsport Live Schedule' });
    this.nutriLogicHeading = page.getByRole('heading', { name: 'NutriLogic' });
    this.fruitMarketHeading = page.getByRole('heading', { name: 'Fruit Market App Design' });
    this.romaMalkistHeading = page.getByRole('heading', { name: 'Roma Malkist Product Landing Page' });
    this.mentengStreetHeading = page.getByRole('heading', { name: 'Menteng Street Environment ML Dashboard' });
    this.licensesHeading = page.getByRole('heading', { name: 'Licenses & Certifications.' });
    this.mtcnaHeading = page.getByRole('heading', { name: 'MTCNA Certification' });
    this.dataAnalystHeading = page.getByRole('heading', { name: 'Data Analyst Using Excel & SQL' });
    this.uiUxNonDesignersHeading = page.getByRole('heading', { name: 'UI/UX for Non-Designers' });
    this.juaraVibeCodingHeading = page.getByRole('heading', { name: '#JuaraVibeCoding Participant' });
    this.reachOutHeading = page.getByRole('heading', { name: 'Reach out directly.' });
  }

  async goto() {
    await this.page.goto('https://www.zmzarialfi.my.id/');
  }
}
