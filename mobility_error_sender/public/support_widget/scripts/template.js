export class TemplateLoader {
    constructor(templateMap = {}) {
        this.templates = {};
        this.loading = this.init(templateMap);
    }

    async init(templateMap) {
        const entries = Object.entries(templateMap);
        await Promise.all(
            entries.map(([name, path]) => this.loadTemplate(name, path))
        );
    }

    async loadTemplate(name, path) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load ${path}`);
        }

        const text = await response.text();

        // compile once and store function
        this.templates[name] = this.compile(text);
    }

    compile(str) {
        return new Function("obj",
            "var p=[];" +
            "with(obj){p.push('" +
            str
                .replace(/[\r\t\n]/g, " ")
                .replace(/'(?=[^%]*%>)/g,"\t")
                .split("'").join("\\'")
                .split("\t").join("'")
                .replace(/<%=(.+?)%>/g, "',$1,'")
                .replace(/<%(.+?)%>/g, "');$1;p.push('")
                .split("<%").join("');")
                .split("%>").join("p.push('")
            + "');}return p.join('');"
        );
    }

    async use(name, data = {}) {
        // wait until templates finish loading
        await this.loading;

        const tmplFn = this.templates[name];
        if (!tmplFn) {
            console.error(`Template "${name}" not found`);
            return "";
        }

        return tmplFn(data);
    }
}