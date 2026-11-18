# AI Avatar Study

A single-page study site. Participants get a PID, watch three videos on either the Fixed Study or Variety Study path, then open a Google Form. Each watch is logged.

Open `index.html` for a local look. For video playback and a public link, use the steps below.

## 1. Videos

The clips are already linked in `config.js`.

Fixed Study plays the Black Female videos in this order: Python Conditionals, Python For Loops, then Time Complexity.

Variety Study offers the same six choices before each video, in this order: White Male, White Female, Black Male, Black Female, Asian Male, Asian Female. Round 1 is Python Conditionals, round 2 is Python For Loops, and round 3 is Time Complexity. A portrait is optional: set `portrait` on an avatar in `config.js`, or leave it blank to show initials.

## 2. Connect the Google Form

Copy the form address (it ends in `/viewform`) into `survey.formUrl`. Leave `survey.pidEntryId` blank.

The survey button opens the form. The PID stays on the study page so the participant can type it into the Participant ID question.

## 3. Connect the watch log

1. Create a Google Sheet.
2. Go to **Extensions → Apps Script** and replace the sample code with `google-apps-script/Code.gs`.
3. **Deploy → New deployment → Web app**.
4. Set **Execute as** to **Me** and **Who has access** to **Anyone**.
5. Copy the web app URL (it ends in `/exec`) into `log.scriptUrl` in `config.js`.

The same script keeps the participant count. **Start new participant** asks it for the next PID, so every browser shares one sequence. Each PID can open the survey once. A second request for that PID is refused. Watch events are still appended. Columns are time (UTC), PID, study, round, avatar id, avatar label, video file, and event (`selected`, `started`, `completed`, `survey_opened`). Issued IDs are on the `PIDs` sheet: `pid`, `issuedAt`, and `surveyAt`.

After a script change, deploy a new version. Open the `/exec` URL once. It should say `Avatar study log is running.`

Until `log.scriptUrl` is set, the page will not issue a participant ID. Add `#admin` to the page address, or use **Researcher log** in the footer, to filter the browser copy of the watch log and download a CSV.

## 4. Publish a public link

The site is plain HTML, CSS, and JavaScript. The videos are served from Cloudflare R2, using the addresses in `config.js`. Deploy the page files with [Netlify Drop](https://app.netlify.com/drop), Cloudflare Pages, or GitHub Pages. The laptop and anyone else open that same link.

Search engines are asked not to index the page.

## Running a session

- **Start new participant** assigns the next numeric PID in this browser, starting at `00001`. The following number is issued after that person opens the survey.
- The PID and place in the study survive a refresh in the same browser tab.
- An unfinished video starts again from the beginning. Continue stays off until the video ends, and skipping ahead is blocked.
- After a path is chosen, that PID cannot switch between Fixed and Variety.
- Before the next person begins, return to Home and press **Start new participant**.

## Preview on this computer

From this folder:

```text
py -m http.server 8080
```

Then open `http://localhost:8080`.
