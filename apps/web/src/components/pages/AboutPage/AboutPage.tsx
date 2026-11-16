import type { ReactElement } from "react";
import { usePageTitle } from "../../../lib/navigation/use-page-title.ts";
import { ButtonLink } from "../../atoms/ButtonLink/ButtonLink.tsx";
import { PageHeading } from "../../atoms/PageHeading/PageHeading.tsx";
import { ThemeSwitch } from "../../molecules/ThemeSwitch/ThemeSwitch.tsx";
import "./AboutPage.css";

/**
 * What Plotpal is, what it does, and where the writing goes when the AI is run. It is the same for
 * everyone, signed in or not, so it never asks who is looking. Each sentence was checked against
 * what the app really does (see `.plans/2026-11-16-about-page.md`); change the app and the words
 * together.
 */
export function AboutPage(): ReactElement {
  usePageTitle("About");

  return (
    <main id="main-content" className="about-page page-enter">
      <div className="about-page__tools">
        <ThemeSwitch />
      </div>
      <PageHeading>About Plotpal</PageHeading>

      <section className="about-page__section" aria-labelledby="about-what">
        <h2 id="about-what">What Plotpal is</h2>
        <p>
          Plotpal is a place to plan and write a story. Lay out your acts and scenes, write in a
          calm editor that saves as you type, and, if you want, ask an AI to look for plot holes or
          suggest ideas.
        </p>
      </section>

      <section className="about-page__section" aria-labelledby="about-does">
        <h2 id="about-does">What it does</h2>
        <ul>
          <li>
            <strong>Outline and write.</strong> Add, rename, move and delete acts and scenes. Your
            text saves a couple of seconds after you stop typing. If the connection drops, it keeps
            your words and keeps trying.
          </li>
          <li>
            <strong>No lost work between tabs.</strong> If the same scene is open in two tabs, the
            second save is stopped and you are asked what to do, instead of one tab silently
            overwriting the other.
          </li>
          <li>
            <strong>Plot-hole finder and idea generator.</strong> Each finding quotes your own text.
            Every quote is checked against your manuscript, and one that is not really there is
            clearly marked as not found.
          </li>
        </ul>
      </section>

      <section className="about-page__section" aria-labelledby="about-ai">
        <h2 id="about-ai">Your writing and the AI</h2>
        <p>
          Your projects belong to your account. When you run an AI scan, the text you pick is sent
          to the AI provider to produce the result.
        </p>
      </section>

      <div className="about-page__back">
        <ButtonLink to="/" variant="secondary">
          Go to the home page
        </ButtonLink>
      </div>
    </main>
  );
}
